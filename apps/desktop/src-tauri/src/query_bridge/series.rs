use serde_json::{json, Value};
use tauri::AppHandle;

use super::dispatch::Scope;
use super::mount::handoff;
use super::protocol::{BridgeError, MOUNT_UNAVAILABLE};

const NO_SESSION: &str = "no session context: this command only works inside a Goodboy agent turn";
const NO_PROJECT: &str = "a series belongs to one project: name it with --project <name>";

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

fn optional_number(args: &super::dispatch::Args, key: &str) -> Option<i64> {
    args.get(key).and_then(Value::as_i64)
}

fn flag(args: &super::dispatch::Args, key: &str) -> bool {
    args.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn required_number(args: &super::dispatch::Args, key: &str) -> Result<i64, BridgeError> {
    let Some(value) = optional_number(args, key) else {
        return Err(format!("--{} needs a whole number", key).into());
    };
    if value <= 0 {
        return Err(format!("--{} must be a positive whole number", key).into());
    }
    Ok(value)
}

pub(super) async fn dispatch(
    app: &AppHandle,
    scope: &Scope<'_>,
    verb: &str,
) -> Result<Value, BridgeError> {
    if scope.session.is_empty() {
        return Err(NO_SESSION.into());
    }
    let args = scope.args;
    match verb {
        "create" => {
            let Some(project) = scope.project_id() else {
                return Err(BridgeError::coded(MOUNT_UNAVAILABLE, NO_PROJECT));
            };
            let request_id = text(args, "request-id")?;
            handoff(
                app,
                json!({
                    "provider": "series",
                    "verb": "create",
                    "sessionId": scope.session,
                    "workspaceId": scope.workspace,
                    "projectId": project,
                    "mountId": scope.mount_id(),
                    "requestId": request_id,
                    "args": {
                        "name": text(args, "name")?,
                        "total": optional_number(args, "total"),
                        "workItem": optional_text(args, "work-item"),
                        "workItemUrl": optional_text(args, "work-item-url"),
                        "parentProvider": optional_text(args, "parent-provider"),
                        "parentHost": optional_text(args, "parent-host"),
                        "parentRepo": optional_text(args, "parent-repo"),
                        "parentNumber": optional_number(args, "parent-number"),
                    },
                }),
            )
            .await
        }
        "set-member" => {
            let request_id = text(args, "request-id")?;
            handoff(
                app,
                json!({
                    "provider": "series",
                    "verb": "set-member",
                    "sessionId": scope.session,
                    "workspaceId": scope.workspace,
                    "projectId": scope.project_id(),
                    "mountId": scope.mount_id(),
                    "requestId": request_id,
                    "args": {
                        "series": text(args, "series")?,
                        "position": required_number(args, "position")?,
                        "label": optional_text(args, "label"),
                        "omitted": flag(args, "omitted"),
                    },
                }),
            )
            .await
        }
        "list" => {
            handoff(
                app,
                json!({
                    "provider": "series",
                    "verb": "list",
                    "sessionId": scope.session,
                    "workspaceId": scope.workspace,
                    "projectId": scope.project_id(),
                    "mountId": scope.mount_id(),
                    "args": {},
                }),
            )
            .await
        }
        other => Err(format!("unhandled series command: {}", other).into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn args(pairs: &[(&str, Value)]) -> super::super::dispatch::Args {
        let mut map: BTreeMap<String, Value> = BTreeMap::new();
        for (key, value) in pairs {
            map.insert((*key).to_string(), value.clone());
        }
        map
    }

    #[test]
    fn a_position_below_one_is_refused_before_the_app_is_asked() {
        let error = required_number(&args(&[("position", Value::from(0))]), "position")
            .expect_err("zero is not a position");

        assert!(error.message.contains("positive"));
    }

    #[test]
    fn a_missing_position_names_its_own_flag() {
        let error = required_number(&args(&[]), "position").expect_err("no position");

        assert!(error.message.contains("--position"));
    }

    #[test]
    fn an_absent_optional_parent_number_stays_absent() {
        assert_eq!(optional_number(&args(&[]), "parent-number"), None);
        assert_eq!(
            optional_number(
                &args(&[("parent-number", Value::from(198))]),
                "parent-number"
            ),
            Some(198)
        );
    }
}
