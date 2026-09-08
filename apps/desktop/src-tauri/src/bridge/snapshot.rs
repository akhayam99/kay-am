use base64::Engine as _;
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

use super::frame::NOISE_MAX;
use super::BridgeError;
use crate::db;

/// Snapshot transcript window (PROTOCOL §7): last ~500 events/session or 24 h.
const TRANSCRIPT_MAX_EVENTS: usize = 500;
const TRANSCRIPT_MAX_AGE_HOURS: i64 = 24;

/// Raw-byte chunk size before base64. base64 grows ~1.33x and we add the JSON
/// envelope + AEAD tag, so 32 KiB raw stays comfortably under the 65535 cap.
const CHUNK_RAW_BYTES: usize = 32 * 1024;

/// A serialized snapshot ready to stream: the canonical body bytes plus the
/// metadata the BEGIN/END frames carry.
pub struct Snapshot {
    pub snapshot_id: String,
    pub head_migration: String,
    pub body: Vec<u8>,
    pub sha256_hex: String,
}

impl Snapshot {
    pub fn total_chunks(&self) -> usize {
        if self.body.is_empty() {
            0
        } else {
            (self.body.len() + CHUNK_RAW_BYTES - 1) / CHUNK_RAW_BYTES
        }
    }

    /// base64 of chunk `index` (a raw-byte slice of the canonical body).
    pub fn chunk_b64(&self, index: usize) -> String {
        let start = index * CHUNK_RAW_BYTES;
        let end = (start + CHUNK_RAW_BYTES).min(self.body.len());
        base64::engine::general_purpose::STANDARD.encode(&self.body[start..end])
    }
}

/// Cheap change detector for live sync. Holds one persistent read-only
/// connection and watches SQLite's `data_version`, which bumps whenever ANOTHER
/// connection (the desktop app's writer) commits. Lets the bridge push a fresh
/// snapshot only when the DB actually changed, instead of polling full rebuilds.
pub struct ChangeProbe {
    conn: Connection,
    last: i64,
}

impl ChangeProbe {
    pub fn new() -> Result<Self, BridgeError> {
        let conn = open_ro()?;
        let last = read_data_version(&conn);
        Ok(Self { conn, last })
    }

    /// True once per committed change by the writer connection since last call.
    pub fn changed(&mut self) -> bool {
        let v = read_data_version(&self.conn);
        if v != self.last {
            self.last = v;
            true
        } else {
            false
        }
    }
}

fn read_data_version(conn: &Connection) -> i64 {
    conn.query_row("PRAGMA data_version", [], |r| r.get(0))
        .unwrap_or(0)
}

fn open_ro() -> Result<Connection, BridgeError> {
    let path = db::resolve_db_path().map_err(|e| BridgeError::Db(e.to_string()))?;
    Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| BridgeError::Db(e.to_string()))
}

/// Runs a SELECT and maps each row to a JSON object using the statement's
/// column names, preserving SQLite types via `db::value_to_json`.
fn rows(conn: &Connection, sql: &str) -> Result<Vec<Value>, BridgeError> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| BridgeError::Db(e.to_string()))?;
    let names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let mut q = stmt.query([]).map_err(|e| BridgeError::Db(e.to_string()))?;
    let mut out = Vec::new();
    while let Some(row) = q.next().map_err(|e| BridgeError::Db(e.to_string()))? {
        let mut rec = Map::new();
        for (i, name) in names.iter().enumerate() {
            let rv = row.get_ref(i).map_err(|e| BridgeError::Db(e.to_string()))?;
            rec.insert(name.clone(), db::value_to_json(rv));
        }
        out.push(Value::Object(rec));
    }
    Ok(out)
}

fn head_migration(conn: &Connection) -> String {
    let v: Option<i64> = conn
        .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
        .ok()
        .flatten();
    match v {
        Some(n) => format!("m{n:03}"),
        None => "unknown".to_string(),
    }
}

/// Some columns store JSON as TEXT; embed the named column as a parsed value so
/// the client receives a structured object instead of an escaped string.
fn embed_json_column(mut rows: Vec<Value>, key: &str) -> Vec<Value> {
    for row in &mut rows {
        if let Some(obj) = row.as_object_mut() {
            if let Some(Value::String(s)) = obj.get(key) {
                if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                    obj.insert(key.to_string(), parsed);
                }
            }
        }
    }
    rows
}

/// turn_events.payload is stored as JSON TEXT; embed it as a parsed object so
/// the client receives a structured TurnEvent (PROTOCOL §6), not a string.
fn parse_turn_events(events: Vec<Value>) -> Vec<Value> {
    embed_json_column(events, "payload")
}

/// Caps transcript events at TRANSCRIPT_MAX_EVENTS per session (rows arrive
/// ordered newest-first, so we keep the newest then restore chronological order).
fn cap_per_session(events: Vec<Value>) -> Vec<Value> {
    use std::collections::HashMap;
    let mut counts: HashMap<String, usize> = HashMap::new();
    let mut kept: Vec<Value> = Vec::new();
    for ev in events {
        let sid = ev
            .get("session_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let c = counts.entry(sid).or_insert(0);
        if *c < TRANSCRIPT_MAX_EVENTS {
            *c += 1;
            kept.push(ev);
        }
    }
    kept.reverse();
    kept
}

pub fn build() -> Result<Snapshot, BridgeError> {
    let conn = open_ro()?;
    let head = head_migration(&conn);

    let workspaces = rows(
        &conn,
        "SELECT w.id AS id, w.name AS name, p.root_path AS root_path, p.kind AS kind, \
                w.disconnected_at AS disconnected_at, w.last_accessed_at AS last_accessed_at, \
                w.created_at AS created_at, w.updated_at AS updated_at \
         FROM workspaces w \
         LEFT JOIN projects p ON p.id = ( \
           SELECT id FROM projects WHERE workspace_id = w.id \
           ORDER BY disconnected_at IS NULL DESC, created_at ASC, id ASC LIMIT 1 \
         ) \
         WHERE w.deleted_at IS NULL",
    )?;
    let sessions = rows(
        &conn,
        "SELECT id, workspace_id, goal, state_kind, last_activity_at, \
         provider_allow_override, permission_mode, \
         archived_at, deleted_at, created_at, updated_at \
         FROM sessions WHERE deleted_at IS NULL AND archived_at IS NULL",
    )?;
    let agents = rows(
        &conn,
        "SELECT id, session_id, step_id, ordinal, name, kind, status, provider_run_id, output_summary, \
         effort, model_override, provider_override, \
         parent_agent_id, workflow_run_id, started_at, last_finished_at, deleted_at \
         FROM agents WHERE deleted_at IS NULL",
    )?;
    let messages = rows(
        &conn,
        "SELECT id, session_id, agent_id, role, content, created_at FROM messages ORDER BY created_at ASC",
    )?;
    let cutoff_ms = chrono_now_ms() - TRANSCRIPT_MAX_AGE_HOURS * 3_600_000;
    let turn_events_raw = rows(
        &conn,
        &format!(
            "SELECT id, session_id, agent_id, created_at, payload FROM turn_events \
             WHERE created_at >= {cutoff_ms} ORDER BY created_at DESC"
        ),
    )?;
    let turn_events = parse_turn_events(cap_per_session(turn_events_raw));
    let context_slots = rows(
        &conn,
        "SELECT session_id, key, value, enabled FROM context_slots",
    )?;
    let session_plans = rows(
        &conn,
        "SELECT id, session_id, agent_id, title, body_md, status, clusters_json, workflow_run_id, \
         created_at, updated_at FROM session_plans",
    )?;
    let workflows = rows(
        &conn,
        "SELECT id, workspace_id, name, description, goal, is_preset, deleted_at, created_at, updated_at \
         FROM workflows WHERE deleted_at IS NULL",
    )?;
    let steps = rows(
        &conn,
        "SELECT id, workflow_id, ordinal, name, role, deleted_at \
         FROM steps WHERE deleted_at IS NULL",
    )?;
    let session_workflows = rows(
        &conn,
        "SELECT workflow_run_id, session_id, workflow_id, ordinal, current_step_ordinal, goal, \
         trigger_mode, discarded_at, created_at FROM session_workflows WHERE discarded_at IS NULL",
    )?;
    let session_worktrees = rows(
        &conn,
        "SELECT id AS mount_id, session_id, project_id, branch, repo_slug, parallel_index, \
         is_attached, disk_state FROM session_worktrees",
    )?;
    let mount_pr_links = rows(
        &conn,
        "SELECT mount_id, provider, host, repo_slug, pr_number, head_branch, base_branch, state \
         FROM mount_pr_links",
    )?;
    let github_pr_cache = embed_json_column(
        rows(
            &conn,
            "SELECT branch, repo_slug, pr_json, fetched_at FROM github_pr_cache",
        )?,
        "pr_json",
    );
    // External provider task linked to a session (Linear/Sentry/GitLab issue).
    // Read-only mirror of session_external_tasks (m044, widened to sentry/gitlab
    // by m064/m065). The phone renders an external-task chip that opens `url`.
    // The desktop table has no per-issue state column, so `state` is omitted here
    // and decodes to nil on the phone.
    let session_external_tasks = rows(
        &conn,
        "SELECT session_id, provider, identifier, title, url FROM session_external_tasks",
    )?;
    // Per-session budget rollup for the mobile CostRing: aggregate spend from
    // telemetry_records and the optional soft cap from session_budgets. Read-only
    // mirror; the desktop owns budget enforcement. cap_usd is NULL when no budget
    // is set (the phone renders spend without a ring).
    let session_costs = rows(
        &conn,
        "SELECT s.id AS session_id, \
                COALESCE(c.spent_usd, 0) AS spent_usd, \
                b.soft_cap_usd AS cap_usd \
         FROM sessions s \
         LEFT JOIN (SELECT session_id, SUM(estimated_cost_usd) AS spent_usd \
                    FROM telemetry_records GROUP BY session_id) c ON c.session_id = s.id \
         LEFT JOIN session_budgets b ON b.session_id = s.id \
         WHERE s.deleted_at IS NULL AND s.archived_at IS NULL",
    )?;

    let snapshot_id = format!("snap_{}", random_id());
    let body_value = json!({
        "schemaVersion": 1,
        "snapshotId": snapshot_id.clone(),
        "headMigration": head.clone(),
        "generatedAt": iso_now(),
        "transcriptWindow": {
            "perSessionMaxEvents": TRANSCRIPT_MAX_EVENTS,
            "maxAgeHours": TRANSCRIPT_MAX_AGE_HOURS,
        },
        "entities": {
            "workspaces": workspaces,
            "sessions": sessions,
            "agents": agents,
            "messages": messages,
            "turn_events": turn_events,
            "context_slots": context_slots,
            "session_plans": session_plans,
            "workflows": workflows,
            "steps": steps,
            "session_workflows": session_workflows,
            "session_worktrees": session_worktrees,
            "mount_pr_links": mount_pr_links,
            "github_pr_cache": github_pr_cache,
            "session_costs": session_costs,
            "session_external_tasks": session_external_tasks,
        }
    });

    let body = serde_json::to_vec(&body_value).map_err(BridgeError::Json)?;
    let sha256_hex = {
        let mut h = Sha256::new();
        h.update(&body);
        format!("{:x}", h.finalize())
    };

    debug_assert!(CHUNK_RAW_BYTES < NOISE_MAX);
    Ok(Snapshot {
        snapshot_id,
        head_migration: head,
        body,
        sha256_hex,
    })
}

fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn iso_now() -> String {
    // Minimal RFC3339 UTC formatter (no chrono dep). Precision: seconds + .000Z.
    let ms = chrono_now_ms();
    let secs = ms / 1000;
    let days = secs / 86400;
    let tod = secs % 86400;
    let (h, m, s) = (tod / 3600, (tod % 3600) / 60, tod % 60);
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.000Z")
}

/// Howard Hinnant's days->civil date algorithm.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn random_id() -> String {
    use rand::Rng;
    const ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut rng = rand::rng();
    (0..12)
        .map(|_| ALPHABET[rng.random_range(0..ALPHABET.len())] as char)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(session: &str, n: i64) -> Value {
        json!({ "session_id": session, "n": n })
    }

    fn snap(body: Vec<u8>) -> Snapshot {
        Snapshot {
            snapshot_id: "s".into(),
            head_migration: "m001".into(),
            body,
            sha256_hex: "x".into(),
        }
    }

    #[test]
    fn cap_per_session_restores_chronological_order() {
        // Rows arrive newest-first (created_at DESC); the cap keeps that order
        // then reverses, so the client receives oldest-first within the window.
        let newest_first = vec![ev("s1", 3), ev("s1", 2), ev("s1", 1)];
        let ns: Vec<i64> = cap_per_session(newest_first)
            .iter()
            .map(|e| e["n"].as_i64().unwrap())
            .collect();
        assert_eq!(ns, vec![1, 2, 3]);
    }

    #[test]
    fn cap_per_session_keeps_newest_window_and_drops_oldest() {
        // 502 events newest-first: n = 502 (newest) .. 1 (oldest).
        let newest_first: Vec<Value> = (1..=502).rev().map(|n| ev("s1", n)).collect();
        let kept = cap_per_session(newest_first);
        assert_eq!(kept.len(), TRANSCRIPT_MAX_EVENTS);
        let ns: Vec<i64> = kept.iter().map(|e| e["n"].as_i64().unwrap()).collect();
        // Oldest two (n=1,2) dropped; window is n=3..=502, chronological.
        assert_eq!(*ns.first().unwrap(), 3);
        assert_eq!(*ns.last().unwrap(), 502);
    }

    #[test]
    fn cap_per_session_counts_each_session_independently() {
        let mut input: Vec<Value> = (1..=600).rev().map(|n| ev("s1", n)).collect();
        input.push(ev("s2", 1));
        let kept = cap_per_session(input);
        let s1 = kept.iter().filter(|e| e["session_id"] == "s1").count();
        let s2 = kept.iter().filter(|e| e["session_id"] == "s2").count();
        assert_eq!(s1, TRANSCRIPT_MAX_EVENTS);
        assert_eq!(s2, 1);
    }

    #[test]
    fn embed_json_column_parses_text_into_structured_value() {
        let rows =
            vec![json!({ "branch": "main", "pr_json": "{\"number\":7,\"state\":\"open\"}" })];
        let out = embed_json_column(rows, "pr_json");
        assert_eq!(out[0]["pr_json"]["number"], json!(7));
        assert_eq!(out[0]["pr_json"]["state"], json!("open"));
    }

    #[test]
    fn embed_json_column_leaves_non_json_and_missing_untouched() {
        let rows = vec![
            json!({ "pr_json": "not json at all" }),
            json!({ "other": 1 }),
        ];
        let out = embed_json_column(rows, "pr_json");
        assert_eq!(out[0]["pr_json"], json!("not json at all"));
        assert!(out[1].get("pr_json").is_none());
    }

    #[test]
    fn parse_turn_events_embeds_payload() {
        let events = vec![json!({ "id": "e1", "payload": "{\"kind\":\"delta\"}" })];
        let out = parse_turn_events(events);
        assert_eq!(out[0]["payload"]["kind"], json!("delta"));
    }

    #[test]
    fn total_chunks_handles_empty_exact_and_overflow_boundaries() {
        assert_eq!(snap(vec![]).total_chunks(), 0);
        assert_eq!(snap(vec![0u8; CHUNK_RAW_BYTES]).total_chunks(), 1);
        assert_eq!(snap(vec![0u8; CHUNK_RAW_BYTES + 1]).total_chunks(), 2);
    }

    #[test]
    fn chunk_b64_roundtrips_the_whole_body() {
        let body: Vec<u8> = (0..(CHUNK_RAW_BYTES * 2 + 123))
            .map(|i| (i % 256) as u8)
            .collect();
        let s = snap(body.clone());
        let mut reassembled = Vec::new();
        for i in 0..s.total_chunks() {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(s.chunk_b64(i))
                .expect("valid base64");
            reassembled.extend(decoded);
        }
        assert_eq!(reassembled, body);
    }

    #[test]
    fn civil_from_days_matches_known_dates() {
        // Cross-checked against Unix epoch-day arithmetic (ts / 86400).
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(10957), (2000, 1, 1));
        assert_eq!(civil_from_days(18321), (2020, 2, 29)); // leap day
    }

    #[test]
    fn iso_now_is_well_formed_rfc3339() {
        let s = iso_now();
        assert_eq!(s.len(), 24, "unexpected format: {s}");
        assert!(s.ends_with(".000Z"), "missing millis/zulu: {s}");
        let year: i64 = s[0..4].parse().expect("year");
        assert!(year >= 2025, "year looks wrong: {s}");
    }
}
