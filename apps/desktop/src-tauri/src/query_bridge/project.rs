use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use super::protocol::{BridgeError, QueryRequest, AMBIGUOUS_MOUNT};
use crate::db::Db;

const MATERIALIZE_EVENT: &str = "query-bridge://project-materialize";
const MATERIALIZE_TIMEOUT: Duration = Duration::from_secs(180);

type Outcome = Result<Value, BridgeError>;
type Pending = Mutex<HashMap<String, oneshot::Sender<Outcome>>>;

fn pending() -> &'static Pending {
    static PENDING: OnceLock<Pending> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn request_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn text_arg(request: &QueryRequest, key: &str) -> Result<String, BridgeError> {
    request
        .args
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("--{} must not be empty", key).into())
}

struct ResolvedProject {
    id: String,
    name: String,
}

fn resolve_project(
    app: &AppHandle,
    workspace_id: &str,
    session_id: &str,
    name: &str,
) -> Result<ResolvedProject, BridgeError> {
    let state = app.state::<Db>();
    let conn = state
        .0
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let session_workspace: Option<String> = conn
        .query_row(
            "SELECT workspace_id FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match session_workspace {
        None => return Err(format!("unknown session: {}", session_id).into()),
        Some(owner) if owner != workspace_id => {
            return Err("this session does not belong to the requested workspace".into())
        }
        Some(_) => {}
    }
    let resolved: Option<(String, String)> = conn
        .query_row(
            "SELECT id, name FROM projects
             WHERE workspace_id = ?1 AND disconnected_at IS NULL AND lower(name) = lower(?2)
             ORDER BY created_at ASC, id ASC
             LIMIT 1",
            rusqlite::params![workspace_id, name],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some((id, name)) = resolved {
        return Ok(ResolvedProject { id, name });
    }
    let mut statement = conn
        .prepare(
            "SELECT name FROM projects
             WHERE workspace_id = ?1 AND disconnected_at IS NULL
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|error| error.to_string())?;
    let names: Vec<String> = statement
        .query_map(rusqlite::params![workspace_id], |row| row.get(0))
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .collect();
    Err(format!(
        "unknown project: {}. this workspace has: {}",
        name,
        names.join(", ")
    )
    .into())
}

pub async fn materialize(app: &AppHandle, request: &QueryRequest) -> Result<Value, BridgeError> {
    if request.verb != "materialize" {
        return Err(format!("unhandled project command: {}", request.verb).into());
    }
    if request.session_id.is_empty() {
        return Err(
            "no session context: this command only works inside a Goodboy agent turn".into(),
        );
    }
    let name = text_arg(request, "name")?;
    let reason = text_arg(request, "reason")?;
    let project = resolve_project(app, &request.workspace_id, &request.session_id, &name)?;
    refuse_when_already_split(app, request, &project)?;
    let id = request_id();
    let (sender, receiver) = oneshot::channel::<Outcome>();
    pending()
        .lock()
        .map_err(|_| "materialize registry poisoned".to_string())?
        .insert(id.clone(), sender);
    let emitted = app.emit(
        MATERIALIZE_EVENT,
        json!({
            "id": id,
            "sessionId": request.session_id,
            "projectId": project.id,
            "projectName": project.name,
            "reason": reason,
        }),
    );
    if let Err(error) = emitted {
        pending()
            .lock()
            .map_err(|_| "materialize registry poisoned".to_string())?
            .remove(&id);
        return Err(error.to_string().into());
    }
    let outcome = tokio::time::timeout(MATERIALIZE_TIMEOUT, receiver).await;
    match outcome {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("the app dropped the materialization request".into()),
        Err(_) => {
            pending()
                .lock()
                .map_err(|_| "materialize registry poisoned".to_string())?
                .remove(&id);
            Err("timed out waiting for the app to materialize the project".into())
        }
    }
}

fn refuse_when_already_split(
    app: &AppHandle,
    request: &QueryRequest,
    project: &ResolvedProject,
) -> Result<(), BridgeError> {
    let rows = super::mount::session_mounts(app, &request.workspace_id, &request.session_id)?;
    let owned: Vec<super::mount::MountRow> = rows
        .into_iter()
        .filter(|row| row.project_id.as_deref() == Some(project.id.as_str()))
        .collect();
    if owned.len() < 2 {
        return Ok(());
    }
    Err(BridgeError::coded(
        AMBIGUOUS_MOUNT,
        format!(
            "{} already holds several mounts in this session: work in one of them, or fork with `mount fork`",
            project.name
        ),
    )
    .with_candidates(super::mount::candidates(&owned)))
}

#[tauri::command]
pub fn project_materialize_result(
    id: String,
    ok: bool,
    error: Option<String>,
    mount_id: Option<String>,
    mount_path: Option<String>,
    branch: Option<String>,
) {
    let sender = match pending().lock() {
        Ok(mut map) => map.remove(&id),
        Err(_) => None,
    };
    let Some(sender) = sender else {
        return;
    };
    let outcome: Outcome = if ok {
        Ok(json!({
            "mountId": mount_id.unwrap_or_default(),
            "mountPath": mount_path.unwrap_or_default(),
            "branch": branch.unwrap_or_default(),
        }))
    } else {
        Err(error
            .unwrap_or_else(|| "materialization failed".to_string())
            .into())
    };
    let _ = sender.send(outcome);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn request(args: &[(&str, Value)]) -> QueryRequest {
        QueryRequest {
            workspace_id: "ws-1".to_string(),
            session_id: "session-1".to_string(),
            project: String::new(),
            mount: String::new(),
            run_id: String::new(),
            provider: "project".to_string(),
            verb: "materialize".to_string(),
            args: args
                .iter()
                .map(|(key, value)| ((*key).to_string(), value.clone()))
                .collect::<BTreeMap<String, Value>>(),
        }
    }

    #[test]
    fn a_blank_reason_is_refused_before_anything_runs() {
        let refused = request(&[("name", Value::from("app")), ("reason", Value::from("   "))]);

        assert!(text_arg(&refused, "reason")
            .expect_err("blank reason")
            .message
            .contains("--reason"));
    }

    #[test]
    fn a_missing_name_is_refused_with_its_own_flag() {
        let refused = request(&[("reason", Value::from("the plan says so"))]);

        assert!(text_arg(&refused, "name")
            .expect_err("missing name")
            .message
            .contains("--name"));
    }

    #[test]
    fn a_result_for_an_unknown_id_is_dropped_silently() {
        project_materialize_result(
            "nobody-waits-for-this".to_string(),
            true,
            None,
            Some("mount-1".to_string()),
            Some("/tmp/mount".to_string()),
            Some("goodboy/x".to_string()),
        );
    }

    #[test]
    fn a_success_result_reaches_the_waiting_dispatcher() {
        let (sender, mut receiver) = oneshot::channel::<Outcome>();
        pending()
            .lock()
            .expect("registry")
            .insert("req-1".to_string(), sender);

        project_materialize_result(
            "req-1".to_string(),
            true,
            None,
            Some("mount-1".to_string()),
            Some("/tmp/mount".to_string()),
            Some("goodboy/x".to_string()),
        );

        let outcome = receiver.try_recv().expect("an answer").expect("a mount");
        assert_eq!(outcome["mountId"], "mount-1");
        assert_eq!(outcome["mountPath"], "/tmp/mount");
        assert_eq!(outcome["branch"], "goodboy/x");
    }

    #[test]
    fn a_failure_result_carries_the_reported_error() {
        let (sender, mut receiver) = oneshot::channel::<Outcome>();
        pending()
            .lock()
            .expect("registry")
            .insert("req-2".to_string(), sender);

        project_materialize_result(
            "req-2".to_string(),
            false,
            Some("git worktree add failed".to_string()),
            None,
            None,
            None,
        );

        let outcome = receiver.try_recv().expect("an answer");
        assert_eq!(outcome, Err("git worktree add failed".into()));
    }
}
