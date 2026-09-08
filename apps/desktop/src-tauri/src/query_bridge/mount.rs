use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use rusqlite::OptionalExtension;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use super::dispatch::Scope;
use super::protocol::{
    BridgeError, AMBIGUOUS_MOUNT, MOUNT_UNAVAILABLE, OPERATION_PENDING, REQUEST_CONFLICT,
};
use crate::db::Db;

const MOUNT_EVENT: &str = "query-bridge://mount-command";
const MOUNT_TIMEOUT: Duration = Duration::from_secs(180);
const NO_SESSION: &str = "no session context: this command only works inside a Goodboy agent turn";
const NO_MOUNT: &str = "this session mounts no repository";

type Outcome = Result<Value, BridgeError>;
type Pending = Mutex<HashMap<String, oneshot::Sender<Outcome>>>;

fn pending() -> &'static Pending {
    static PENDING: OnceLock<Pending> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn handoff_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct MountRow {
    pub(super) id: String,
    pub(super) session_id: String,
    pub(super) project_id: Option<String>,
    pub(super) mount_name: Option<String>,
    pub(super) branch: String,
    pub(super) base_branch: Option<String>,
    pub(super) worktree_path: Option<String>,
    pub(super) last_worktree_path: Option<String>,
    pub(super) repo_slug: Option<String>,
    pub(super) repo_root: Option<String>,
    pub(super) is_attached: bool,
    pub(super) disk_state: String,
    pub(super) revision: i64,
}

impl MountRow {
    pub(super) fn is_physical(&self) -> bool {
        self.is_attached && self.worktree_path.is_some()
    }

    pub(super) fn working_dir(&self) -> Option<String> {
        self.worktree_path
            .clone()
            .or_else(|| self.repo_root.clone())
    }

    pub(super) fn to_result(&self) -> Value {
        json!({
            "mountId": self.id,
            "sessionId": self.session_id,
            "projectId": self.project_id,
            "mountName": self.mount_name,
            "branch": self.branch,
            "baseBranch": self.base_branch,
            "mountPath": self.worktree_path,
            "isAttached": self.is_attached,
            "diskState": self.disk_state,
            "revision": self.revision,
        })
    }

    fn to_candidate(&self) -> Value {
        json!({
            "mountId": self.id,
            "mountName": self.mount_name,
            "projectId": self.project_id,
            "branch": self.branch,
            "mountPath": self.worktree_path,
            "isAttached": self.is_attached,
        })
    }
}

pub(super) fn session_mounts(
    app: &AppHandle,
    workspace_id: &str,
    session_id: &str,
) -> Result<Vec<MountRow>, BridgeError> {
    if session_id.is_empty() {
        return Err(NO_SESSION.into());
    }
    let state = app.state::<Db>();
    let conn = state
        .0
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let owner: Option<String> = conn
        .query_row(
            "SELECT workspace_id FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match owner {
        None => return Err(format!("unknown session: {}", session_id).into()),
        Some(owner) if owner != workspace_id => {
            return Err("this session does not belong to the requested workspace".into())
        }
        Some(_) => {}
    }
    let mut statement = conn
        .prepare(
            "SELECT sw.id, sw.session_id, sw.project_id, sw.mount_name, sw.branch, sw.base_branch,
                    sw.worktree_path, sw.last_worktree_path, sw.repo_slug, p.root_path,
                    sw.is_attached, sw.disk_state, sw.revision
             FROM session_worktrees sw
             LEFT JOIN projects p ON p.id = sw.project_id
             WHERE sw.session_id = ?1
             ORDER BY sw.parallel_index ASC, sw.created_at ASC, sw.id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(rusqlite::params![session_id], |row| {
            Ok(MountRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                project_id: row.get(2)?,
                mount_name: row.get(3)?,
                branch: row.get(4)?,
                base_branch: row.get(5)?,
                worktree_path: row.get(6)?,
                last_worktree_path: row.get(7)?,
                repo_slug: row.get(8)?,
                repo_root: row.get(9)?,
                is_attached: row.get::<_, i64>(10)? == 1,
                disk_state: row.get(11)?,
                revision: row.get(12)?,
            })
        })
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .collect();
    Ok(rows)
}

pub(super) fn candidates(rows: &[MountRow]) -> Value {
    Value::Array(rows.iter().map(MountRow::to_candidate).collect())
}

pub(super) struct Selection<'a> {
    pub(super) rows: &'a [MountRow],
    pub(super) mount_id: Option<&'a str>,
    pub(super) project_id: Option<&'a str>,
}

pub(super) fn select_mount(selection: Selection<'_>) -> Result<MountRow, BridgeError> {
    let Selection {
        rows,
        mount_id,
        project_id,
    } = selection;
    if let Some(mount_id) = mount_id {
        let Some(row) = rows.iter().find(|row| row.id == mount_id) else {
            return Err(BridgeError::coded(
                MOUNT_UNAVAILABLE,
                format!("no mount of this session has the id {}", mount_id),
            )
            .with_candidates(candidates(rows)));
        };
        if let Some(project_id) = project_id {
            if row.project_id.as_deref() != Some(project_id) {
                return Err(BridgeError::coded(
                    MOUNT_UNAVAILABLE,
                    "that mount belongs to another project of this workspace",
                )
                .with_candidates(candidates(rows)));
            }
        }
        return Ok(row.clone());
    }
    let eligible: Vec<MountRow> = rows
        .iter()
        .filter(|row| row.is_physical())
        .filter(|row| match project_id {
            None => true,
            Some(project_id) => row.project_id.as_deref() == Some(project_id),
        })
        .cloned()
        .collect();
    match eligible.len() {
        0 => Err(BridgeError::coded(MOUNT_UNAVAILABLE, NO_MOUNT)),
        1 => Ok(eligible[0].clone()),
        _ => Err(BridgeError::coded(
            AMBIGUOUS_MOUNT,
            "this session holds more than one mount: name the one you mean with --mount <id>",
        )
        .with_candidates(candidates(&eligible))),
    }
}

pub(super) fn resolve_scope_mount(
    app: &AppHandle,
    scope: &Scope<'_>,
) -> Result<MountRow, BridgeError> {
    let rows = session_mounts(app, scope.workspace, scope.session)?;
    select_mount(Selection {
        rows: &rows,
        mount_id: scope.mount_id(),
        project_id: scope.project_id(),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OperationRow {
    kind: String,
    status: String,
    input: Value,
    result: Value,
    error_code: Option<String>,
    mount_id: Option<String>,
}

fn operation_row(
    app: &AppHandle,
    session_id: &str,
    request_id: &str,
) -> Result<Option<OperationRow>, BridgeError> {
    let state = app.state::<Db>();
    let conn = state
        .0
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let row: Option<(
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = conn
        .query_row(
            "SELECT kind, status, input_json, result_json, error_code, mount_id
             FROM mount_operations
             WHERE session_id = ?1 AND request_id = ?2
             LIMIT 1",
            rusqlite::params![session_id, request_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(row.map(
        |(kind, status, input, result, error_code, mount_id)| OperationRow {
            kind,
            status,
            input: serde_json::from_str(&input).unwrap_or(Value::Null),
            result: result
                .and_then(|raw| serde_json::from_str(&raw).ok())
                .unwrap_or(Value::Null),
            error_code,
            mount_id,
        },
    ))
}

fn record_pending(
    app: &AppHandle,
    session_id: &str,
    request_id: &str,
    kind: &str,
    mount_id: Option<&str>,
    input: &Value,
) -> Result<(), BridgeError> {
    let state = app.state::<Db>();
    let conn = state
        .0
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let now = crate::util::now_ms();
    conn.execute(
        "INSERT INTO mount_operations
           (id, session_id, mount_id, request_id, kind, status, expected_revision, input_json,
            result_json, error_code, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', 0, ?6, NULL, NULL, ?7, ?7)
         ON CONFLICT (session_id, request_id) DO UPDATE SET
           status = 'pending',
           input_json = excluded.input_json,
           error_code = NULL,
           updated_at = excluded.updated_at",
        rusqlite::params![
            handoff_id(),
            session_id,
            mount_id,
            request_id,
            kind,
            input.to_string(),
            now
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn conflicting_input(recorded: &Value, incoming: &Value) -> bool {
    let (Value::Object(recorded), Value::Object(incoming)) = (recorded, incoming) else {
        return false;
    };
    incoming
        .iter()
        .any(|(key, value)| recorded.get(key).is_some_and(|found| found != value))
}

enum Replay {
    Fresh,
    Settled(Value),
}

fn guard_request(
    app: &AppHandle,
    session_id: &str,
    request_id: &str,
    kind: &str,
    input: &Value,
    rows: &[MountRow],
) -> Result<Replay, BridgeError> {
    let Some(existing) = operation_row(app, session_id, request_id)? else {
        return Ok(Replay::Fresh);
    };
    if existing.kind != kind || conflicting_input(&existing.input, input) {
        return Err(BridgeError::coded(
            REQUEST_CONFLICT,
            format!(
                "--request-id {} already names a different {} request",
                request_id, existing.kind
            ),
        ));
    }
    match existing.status.as_str() {
        "succeeded" => {
            let mount_id = existing
                .result
                .get("mountId")
                .and_then(Value::as_str)
                .or(existing.mount_id.as_deref());
            let mount = mount_id
                .and_then(|id| rows.iter().find(|row| row.id == id))
                .map(MountRow::to_result);
            Ok(Replay::Settled(json!({
                "operationId": request_id,
                "status": "succeeded",
                "mount": mount,
                "replayed": true,
            })))
        }
        "failed" => Ok(Replay::Fresh),
        _ => Err(BridgeError::coded(
            OPERATION_PENDING,
            format!(
                "request {} is still {}: read it with `mount operation --request-id {}` instead of starting another one",
                request_id, existing.status, request_id
            ),
        )),
    }
}

pub(super) async fn handoff(app: &AppHandle, payload: Value) -> Result<Value, BridgeError> {
    let id = handoff_id();
    let (sender, receiver) = oneshot::channel::<Outcome>();
    pending()
        .lock()
        .map_err(|_| "mount registry poisoned".to_string())?
        .insert(id.clone(), sender);
    let mut envelope = match payload {
        Value::Object(fields) => fields,
        _ => Map::new(),
    };
    envelope.insert("id".to_string(), Value::String(id.clone()));
    let emitted = app.emit(MOUNT_EVENT, Value::Object(envelope));
    if let Err(error) = emitted {
        pending()
            .lock()
            .map_err(|_| "mount registry poisoned".to_string())?
            .remove(&id);
        return Err(error.to_string().into());
    }
    match tokio::time::timeout(MOUNT_TIMEOUT, receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("the app dropped the mount request".into()),
        Err(_) => {
            pending()
                .lock()
                .map_err(|_| "mount registry poisoned".to_string())?
                .remove(&id);
            Err(BridgeError::coded(
                OPERATION_PENDING,
                "the app did not answer in time: the request may still be running, read it with `mount operation --request-id <id>`",
            ))
        }
    }
}

fn text(args: &super::dispatch::Args, key: &str) -> Result<String, BridgeError> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("--{} must not be empty", key).into())
}

fn optional_text(args: &super::dispatch::Args, key: &str) -> Option<String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn flag(args: &super::dispatch::Args, key: &str) -> bool {
    args.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn operation_kind(verb: &str) -> &'static str {
    match verb {
        "fork" => "fork",
        "attach" => "attach",
        "unmount" => "unmount",
        _ => "switch",
    }
}

fn intent_of(raw: &str) -> Result<&'static str, BridgeError> {
    match raw {
        "switch" => Ok("switch"),
        "fork" => Ok("fork"),
        other => Err(format!("unknown intent: {}. use switch or fork", other).into()),
    }
}

pub(super) async fn dispatch(
    app: &AppHandle,
    scope: &Scope<'_>,
    verb: &str,
) -> Result<Value, BridgeError> {
    let args = scope.args;
    let rows = session_mounts(app, scope.workspace, scope.session)?;
    if verb == "list" {
        return Ok(
            json!({ "mounts": rows.iter().map(MountRow::to_result).collect::<Vec<Value>>() }),
        );
    }
    if verb == "operation" {
        let request_id = text(args, "request-id")?;
        let Some(existing) = operation_row(app, scope.session, &request_id)? else {
            return Err(BridgeError::coded(
                MOUNT_UNAVAILABLE,
                format!(
                    "no request of this session is recorded under {}",
                    request_id
                ),
            ));
        };
        return Ok(json!({
            "operationId": request_id,
            "status": existing.status,
            "result": existing.result,
            "error": existing.error_code,
        }));
    }
    let Some(mount_id) = scope.mount_id() else {
        return Err(BridgeError::coded(
            MOUNT_UNAVAILABLE,
            "this command acts on one mount: name it with --mount <id>, from `mount list`",
        )
        .with_candidates(candidates(&rows)));
    };
    let mount = select_mount(Selection {
        rows: &rows,
        mount_id: Some(mount_id),
        project_id: scope.project_id(),
    })?;
    if verb == "inspect" {
        return handoff(
            app,
            json!({
                "provider": "mount",
                "verb": "inspect",
                "sessionId": scope.session,
                "workspaceId": scope.workspace,
                "mountId": mount.id,
                "projectId": mount.project_id,
                "args": { "size": flag(args, "size") },
            }),
        )
        .await;
    }
    let request_id = text(args, "request-id")?;
    if verb == "activate" {
        return handoff(
            app,
            json!({
                "provider": "mount",
                "verb": "activate",
                "sessionId": scope.session,
                "workspaceId": scope.workspace,
                "mountId": mount.id,
                "projectId": mount.project_id,
                "requestId": request_id,
                "args": {},
            }),
        )
        .await;
    }
    let reason = text(args, "reason")?;
    let verb_args = match verb {
        "fork" => {
            let branch = text(args, "branch")?;
            let existing = flag(args, "existing");
            let base = optional_text(args, "base");
            if existing && base.is_some() {
                return Err(
                    "--existing adopts a branch that already has a base: drop --base".into(),
                );
            }
            json!({ "branch": branch, "existing": existing, "base": base })
        }
        "switch" => json!({
            "branch": text(args, "branch")?,
            "create": flag(args, "create"),
            "adoptObserved": flag(args, "adopt-observed"),
        }),
        "attach" => json!({}),
        "unmount" => json!({ "keep": flag(args, "keep") }),
        "resolve" => json!({ "intent": intent_of(&text(args, "intent")?)? }),
        other => return Err(format!("unhandled mount command: {}", other).into()),
    };
    let kind = operation_kind(verb);
    let input = json!({ "verb": verb, "mountId": mount.id, "args": verb_args });
    match guard_request(app, scope.session, &request_id, kind, &input, &rows)? {
        Replay::Settled(value) => return Ok(value),
        Replay::Fresh => {}
    }
    record_pending(
        app,
        scope.session,
        &request_id,
        kind,
        Some(&mount.id),
        &input,
    )?;
    handoff(
        app,
        json!({
            "provider": "mount",
            "verb": verb,
            "sessionId": scope.session,
            "workspaceId": scope.workspace,
            "mountId": mount.id,
            "projectId": mount.project_id,
            "requestId": request_id,
            "reason": reason,
            "args": verb_args,
        }),
    )
    .await
}

pub(super) async fn create_request(
    app: &AppHandle,
    scope: &Scope<'_>,
    provider: &str,
) -> Result<Value, BridgeError> {
    let args = scope.args;
    if scope.mount_id().is_none() {
        return Err(BridgeError::coded(
            MOUNT_UNAVAILABLE,
            "creating a review request needs an explicit --mount <id>, from `mount list`",
        ));
    }
    let mount = scope.require_mount()?;
    if !mount.is_physical() {
        return Err(BridgeError::coded(
            MOUNT_UNAVAILABLE,
            "that mount has no worktree on disk: attach it first",
        ));
    }
    let request_id = text(args, "request-id")?;
    handoff(
        app,
        json!({
            "provider": provider,
            "verb": "create-request",
            "sessionId": scope.session,
            "workspaceId": scope.workspace,
            "mountId": mount.id,
            "projectId": mount.project_id,
            "requestId": request_id,
            "args": {
                "title": text(args, "title")?,
                "body": text(args, "body")?,
                "base": optional_text(args, "base"),
                "ready": flag(args, "ready"),
                "referenceMode": optional_text(args, "reference-mode"),
            },
        }),
    )
    .await
}

#[tauri::command]
pub fn mount_command_result(
    id: String,
    ok: bool,
    error: Option<String>,
    code: Option<String>,
    data: Option<Value>,
) {
    let sender = match pending().lock() {
        Ok(mut map) => map.remove(&id),
        Err(_) => None,
    };
    let Some(sender) = sender else {
        return;
    };
    let outcome: Outcome = if ok {
        Ok(data.unwrap_or(Value::Null))
    } else {
        let message = error.unwrap_or_else(|| "the mount command failed".to_string());
        Err(match code {
            Some(code) => BridgeError::coded(&code, message),
            None => message.into(),
        })
    };
    let _ = sender.send(outcome);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str, project: &str, attached: bool, path: Option<&str>) -> MountRow {
        MountRow {
            id: id.to_string(),
            session_id: "session-1".to_string(),
            project_id: Some(project.to_string()),
            mount_name: Some("app".to_string()),
            branch: format!("goodboy/{}", id),
            base_branch: Some("main".to_string()),
            worktree_path: path.map(str::to_string),
            last_worktree_path: path.map(str::to_string),
            repo_slug: Some("acme/app".to_string()),
            repo_root: Some("/repo/app".to_string()),
            is_attached: attached,
            disk_state: "present".to_string(),
            revision: 3,
        }
    }

    #[test]
    fn a_result_carries_every_field_a_caller_needs_to_address_the_mount_again() {
        let value = row("mount-1", "project-1", true, Some("/tmp/one")).to_result();

        assert_eq!(value["mountId"], "mount-1");
        assert_eq!(value["mountPath"], "/tmp/one");
        assert_eq!(value["baseBranch"], "main");
        assert_eq!(value["revision"], 3);
        assert_eq!(value["isAttached"], true);
    }

    #[test]
    fn a_detached_mount_reports_a_null_path_rather_than_an_empty_one() {
        let value = row("mount-2", "project-1", false, None).to_result();

        assert_eq!(value["mountPath"], Value::Null);
        assert_eq!(value["isAttached"], false);
    }

    #[test]
    fn two_mounts_of_one_project_refuse_to_be_picked_for_the_caller() {
        let rows = [
            row("mount-1", "project-1", true, Some("/tmp/one")),
            row("mount-2", "project-1", true, Some("/tmp/two")),
        ];

        let error = select_mount(Selection {
            rows: &rows,
            mount_id: None,
            project_id: Some("project-1"),
        })
        .expect_err("an ambiguous session");

        assert_eq!(error.code.as_deref(), Some(AMBIGUOUS_MOUNT));
        assert_eq!(
            error.candidates.expect("candidates")[1]["mountId"],
            "mount-2"
        );
    }

    #[test]
    fn one_eligible_mount_still_answers_without_an_explicit_id() {
        let rows = [
            row("mount-1", "project-1", true, Some("/tmp/one")),
            row("mount-2", "project-2", false, None),
        ];

        let picked = select_mount(Selection {
            rows: &rows,
            mount_id: None,
            project_id: None,
        })
        .expect("the only physical mount");

        assert_eq!(picked.id, "mount-1");
    }

    #[test]
    fn a_mount_of_another_session_is_refused_rather_than_served() {
        let rows = [row("mount-1", "project-1", true, Some("/tmp/one"))];

        let error = select_mount(Selection {
            rows: &rows,
            mount_id: Some("mount-from-elsewhere"),
            project_id: None,
        })
        .expect_err("a foreign mount");

        assert_eq!(error.code.as_deref(), Some(MOUNT_UNAVAILABLE));
        assert!(error.message.contains("mount-from-elsewhere"));
    }

    #[test]
    fn an_explicit_mount_must_agree_with_an_explicit_project() {
        let rows = [row("mount-1", "project-1", true, Some("/tmp/one"))];

        let error = select_mount(Selection {
            rows: &rows,
            mount_id: Some("mount-1"),
            project_id: Some("project-2"),
        })
        .expect_err("a disagreeing project");

        assert_eq!(error.code.as_deref(), Some(MOUNT_UNAVAILABLE));
    }

    #[test]
    fn a_session_without_any_physical_mount_says_so_instead_of_asking_for_an_id() {
        let rows = [row("mount-1", "project-1", false, None)];

        let error = select_mount(Selection {
            rows: &rows,
            mount_id: None,
            project_id: None,
        })
        .expect_err("no physical mount");

        assert_eq!(error.code.as_deref(), Some(MOUNT_UNAVAILABLE));
        assert_eq!(error.message, NO_MOUNT);
    }

    #[test]
    fn a_retry_that_changes_an_argument_is_a_conflict_and_not_a_second_attempt() {
        let recorded = json!({ "verb": "switch", "args": { "branch": "goodboy/a" } });
        let same = json!({ "verb": "switch", "args": { "branch": "goodboy/a" } });
        let other = json!({ "verb": "switch", "args": { "branch": "goodboy/b" } });

        assert!(!conflicting_input(&recorded, &same));
        assert!(conflicting_input(&recorded, &other));
    }

    #[test]
    fn every_mount_mutation_maps_onto_a_kind_the_operation_table_accepts() {
        let allowed = [
            "attach", "unmount", "switch", "fork", "remove", "restore", "retain",
        ];

        for verb in ["fork", "switch", "attach", "unmount", "resolve"] {
            assert!(
                allowed.contains(&operation_kind(verb)),
                "{} maps to an unknown operation kind",
                verb
            );
        }
        assert_eq!(operation_kind("resolve"), "switch");
    }

    #[test]
    fn an_intent_is_either_a_switch_or_a_fork_and_never_inferred() {
        assert_eq!(intent_of("switch"), Ok("switch"));
        assert_eq!(intent_of("fork"), Ok("fork"));
        assert!(intent_of("guess").is_err());
    }

    #[test]
    fn a_result_for_an_unknown_handoff_is_dropped_silently() {
        mount_command_result(
            "nobody-waits-for-this".to_string(),
            true,
            None,
            None,
            Some(json!({})),
        );
    }

    #[test]
    fn a_refusal_reaches_the_waiting_dispatcher_with_its_machine_code() {
        let (sender, mut receiver) = oneshot::channel::<Outcome>();
        pending()
            .lock()
            .expect("registry")
            .insert("handoff-1".to_string(), sender);

        mount_command_result(
            "handoff-1".to_string(),
            false,
            Some("the branch moved under this mount".to_string()),
            Some("branch_mismatch".to_string()),
            None,
        );

        let error = receiver
            .try_recv()
            .expect("an answer")
            .expect_err("a refusal");
        assert_eq!(error.code.as_deref(), Some("branch_mismatch"));
        assert_eq!(error.message, "the branch moved under this mount");
    }
}
