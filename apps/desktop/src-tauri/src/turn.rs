use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TurnError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("turn registry mutex poisoned")]
    Poisoned,
    #[error("worktree writer lease is not owned by this turn")]
    WriterLeaseNotOwned,
    #[error("turn not found: {0}")]
    NotFound(String),
}

crate::util::impl_error_serialize!(TurnError);

impl TurnError {
    fn kind(&self) -> &'static str {
        match self {
            TurnError::Io(_) => "io",
            TurnError::Poisoned => "poisoned",
            TurnError::WriterLeaseNotOwned => "writer_lease_not_owned",
            TurnError::NotFound(_) => "not_found",
        }
    }
}

type ChildSlot = Arc<Mutex<Option<Child>>>;
type ChildRegistry = Arc<Mutex<HashMap<String, ChildSlot>>>;

#[derive(Default)]
pub struct TurnRegistry(pub ChildRegistry);

impl TurnRegistry {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnArgs {
    pub run_id: String,
    pub model: String,
    pub working_dir: String,
    #[serde(default)]
    pub writable_roots: Vec<String>,
    pub prompt: String,
    #[serde(default)]
    pub binary: Option<String>,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub disallowed_tools: Vec<String>,
    #[serde(default)]
    pub permission_mode: Option<String>,
    // claude-only: when Some, spawn carries `--resume <id>` so the CLI restores
    // the prior conversation instead of starting fresh. Ignored by codex/cursor.
    #[serde(default)]
    pub resume_session_id: Option<String>,
    // claude-only: when Some, spawn carries `--append-system-prompt <prompt>`.
    // Used to bias planner/implementer/debugger agents toward their role.
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub mount_id: Option<String>,
    #[serde(default)]
    pub api_key_env: Option<String>,
    #[serde(default)]
    pub credential_id: Option<String>,
    #[serde(default)]
    pub cursor_max_mode: bool,
    #[serde(default)]
    pub writer_lease: Option<WriterLeaseBinding>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriterLeaseBinding {
    pub path: String,
    pub holder: String,
    pub token: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TurnEventPayload {
    Line {
        line: String,
    },
    End {
        exit_code: Option<i32>,
        stderr: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Serialize, Clone)]
pub struct TurnEventEnvelope {
    #[serde(rename = "runId")]
    pub run_id: String,
    #[serde(flatten)]
    pub event: TurnEventPayload,
}

pub const EVENT_NAME: &str = "turn_event";

/// Per-binary CLI flag set. Unknown binaries fall through to claude.
fn build_provider_cli_args(binary: &str, args: &SpawnOneArgs<'_>) -> Vec<String> {
    let bin = std::path::Path::new(binary)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(binary);

    match bin {
        "cursor-agent" => {
            // --force is cursor's equivalent of claude --dangerously-skip-permissions.
            let mut v = vec![
                "-p".to_string(),
                args.prompt.to_string(),
                "--output-format".to_string(),
                "stream-json".to_string(),
                "--workspace".to_string(),
                args.working_dir.to_string(),
                "--model".to_string(),
                args.model.to_string(),
                "--force".to_string(),
            ];
            // cursor-agent ignores permission rules + resume + system_prompt.
            let _ = (
                args.permission_mode,
                args.allowed_tools,
                args.disallowed_tools,
                args.resume_session_id,
                args.system_prompt,
            );
            v.shrink_to_fit();
            v
        }
        "agy" => {
            let _ = (
                args.allowed_tools,
                args.disallowed_tools,
                args.resume_session_id,
                args.system_prompt,
            );
            let mut v = vec![
                "-p".to_string(),
                args.prompt.to_string(),
                "-m".to_string(),
                args.model.to_string(),
            ];
            if args.permission_mode == "bypassPermissions" {
                v.push("--dangerously-skip-permissions".to_string());
            } else {
                v.push("--sandbox".to_string());
            }
            v.shrink_to_fit();
            v
        }
        "codex" => {
            // codex exec v0.130 gotchas:
            //   --cd, NOT --cwd (codex exits 1 with "unexpected argument").
            //   --skip-git-repo-check, else codex refuses non-trusted dirs.
            //   default sandbox is read-only and silently drops writes; force
            //     workspace-write unless bypass replaces it entirely.
            let _ = (args.resume_session_id, args.system_prompt);
            let mut v: Vec<String> = vec![
                "exec".to_string(),
                "--json".to_string(),
                "--skip-git-repo-check".to_string(),
                "-m".to_string(),
                args.model.to_string(),
                "--cd".to_string(),
                args.working_dir.to_string(),
            ];
            if args.permission_mode == "bypassPermissions" {
                v.push("--dangerously-bypass-approvals-and-sandbox".to_string());
            } else {
                v.push("-s".to_string());
                v.push("workspace-write".to_string());
                v.push("-c".to_string());
                v.push("sandbox_workspace_write.network_access=true".to_string());
                for root in args.writable_roots {
                    v.push("--add-dir".to_string());
                    v.push(root.to_string());
                }
                if let Some(socket_directory) = args.query_socket_directory {
                    v.push("--add-dir".to_string());
                    v.push(socket_directory.to_string());
                }
            }
            if let Some(eff) = args.effort {
                v.push("-c".to_string());
                v.push(format!("model_reasoning_effort=\"{eff}\""));
            }
            v.push("--".to_string());
            v.push(args.prompt.to_string());
            v
        }
        "opencode" | "openrouter" | "moonshot" => {
            let _ = (
                args.permission_mode,
                args.allowed_tools,
                args.disallowed_tools,
                args.system_prompt,
            );
            let mut v = vec![
                "run".to_string(),
                "--format".to_string(),
                "json".to_string(),
                "-m".to_string(),
                args.model.to_string(),
                "--dir".to_string(),
                args.working_dir.to_string(),
                "--dangerously-skip-permissions".to_string(),
            ];
            if let Some(effort) = args.effort {
                v.push("--variant".to_string());
                v.push(effort.to_string());
            }
            if let Some(session_id) = args.resume_session_id {
                v.push("--session".to_string());
                v.push(session_id.to_string());
            }
            v.push("--".to_string());
            v.push(args.prompt.to_string());
            v
        }
        _ => {
            let mut v: Vec<String> = Vec::new();
            // --resume must precede -p so claude restores the prior session
            // before consuming the new user message.
            if let Some(sid) = args.resume_session_id {
                v.push("--resume".to_string());
                v.push(sid.to_string());
            }
            v.extend([
                "-p".to_string(),
                args.prompt.to_string(),
                "--output-format".to_string(),
                "stream-json".to_string(),
                "--verbose".to_string(),
                "--model".to_string(),
                args.model.to_string(),
                "--permission-mode".to_string(),
                args.permission_mode.to_string(),
                "--setting-sources".to_string(),
                crate::aux_spawn::CLAUDE_SETTING_SOURCES.to_string(),
            ]);
            if let Some(sp) = args.system_prompt {
                v.push("--append-system-prompt".to_string());
                v.push(sp.to_string());
            }
            if let Some(eff) = args.effort {
                v.push("--effort".to_string());
                v.push(eff.to_string());
            }
            if !args.allowed_tools.is_empty() {
                v.push("--allowedTools".to_string());
                v.push(args.allowed_tools.join(","));
            }
            let mut disallowed_tools: Vec<String> = args
                .disallowed_tools
                .iter()
                .filter(|tool| tool.as_str() != "mcp__*")
                .cloned()
                .collect();
            disallowed_tools.push("mcp__*".to_string());
            v.push("--disallowedTools".to_string());
            v.push(disallowed_tools.join(","));
            v
        }
    }
}

struct SpawnOneArgs<'a> {
    pub run_id: &'a str,
    pub binary: &'a str,
    pub model: &'a str,
    pub working_dir: &'a str,
    pub writable_roots: &'a [String],
    pub query_socket_directory: Option<&'a str>,
    pub prompt: &'a str,
    pub permission_mode: &'a str,
    pub allowed_tools: &'a [String],
    pub disallowed_tools: &'a [String],
    pub resume_session_id: Option<&'a str>,
    pub system_prompt: Option<&'a str>,
    pub effort: Option<&'a str>,
    pub api_key_env: Option<&'a str>,
    pub credential_id: Option<&'a str>,
    pub workspace_id: Option<&'a str>,
    pub session_id: Option<&'a str>,
    pub mount_id: Option<&'a str>,
    pub cursor_max_mode: bool,
    pub writer_lease: Option<&'a WriterLeaseBinding>,
}

fn max_mode_config_dir_for(binary: &str, cursor_max_mode: bool) -> Option<std::path::PathBuf> {
    let name = std::path::Path::new(binary)
        .file_name()
        .and_then(|value| value.to_str());
    if name != Some("cursor-agent") || !cursor_max_mode {
        return None;
    }
    crate::cursor_config::max_mode_config_dir()
}

fn spawn_leased_child(
    command: &mut Command,
    leases: &crate::worktree_writer::WriterLeaseRegistry,
    binding: Option<&WriterLeaseBinding>,
    run_id: &str,
    on_exit: impl Fn() + Send + 'static,
) -> Result<(Child, Option<crate::worktree_writer::RunLeaseGuard>), TurnError> {
    let guard = binding
        .map(|binding| {
            crate::worktree_writer::RunLeaseGuard::bind(
                leases,
                &binding.path,
                &binding.holder,
                &binding.token,
                run_id,
                on_exit,
            )
            .ok_or(TurnError::WriterLeaseNotOwned)
        })
        .transpose()?;
    let child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    Ok((child, guard))
}

fn spawn_one(
    app: &AppHandle,
    registry: &ChildRegistry,
    leases: &crate::worktree_writer::WriterLeaseRegistry,
    args: SpawnOneArgs<'_>,
) -> Result<String, TurnError> {
    let mut command = crate::path_env::command(args.binary);
    command.current_dir(args.working_dir);
    crate::aux_spawn::scrub_nested_session_env(&mut command);

    if let Some(directory) = max_mode_config_dir_for(args.binary, args.cursor_max_mode) {
        command.env("CURSOR_CONFIG_DIR", directory);
    }

    if let (Some(env_name), Some(cred_id)) = (args.api_key_env, args.credential_id) {
        if let Ok(Some(secret)) = crate::secrets::read(&format!("provider_credential.{cred_id}")) {
            command.env(env_name, secret);
        }
    }

    if let Some(token) = crate::github::token_for_workspace(args.workspace_id) {
        command.env("GH_TOKEN", &token);
        command.env("GITHUB_TOKEN", &token);
    }

    crate::query_bridge::apply_turn_env(
        &mut command,
        crate::query_bridge::TurnBinding {
            workspace_id: args.workspace_id,
            session_id: args.session_id,
            mount_id: args.mount_id,
            run_id: Some(args.run_id),
        },
    );

    let cli_args = build_provider_cli_args(args.binary, &args);
    for a in &cli_args {
        command.arg(a);
    }

    let event_app = app.clone();
    let event_binding = args.writer_lease.cloned();
    let (mut child, lease_guard) = spawn_leased_child(
        &mut command,
        leases,
        args.writer_lease,
        args.run_id,
        move || {
            if let Some(binding) = &event_binding {
                let _ = event_app.emit(
                    crate::worktree_writer::EVENT_NAME,
                    crate::worktree_writer::WriterLeaseEvent {
                        path: binding.path.clone(),
                        holder: binding.holder.clone(),
                        reason: "exited",
                    },
                );
            }
        },
    )?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| TurnError::Io(std::io::Error::other("no stdout")))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| TurnError::Io(std::io::Error::other("no stderr")))?;

    let slot = Arc::new(Mutex::new(Some(child)));
    registry
        .lock()
        .map_err(|_| TurnError::Poisoned)?
        .insert(args.run_id.to_string(), Arc::clone(&slot));

    let app_clone = app.clone();
    let registry_clone = Arc::clone(registry);
    let run_id_owned = args.run_id.to_string();

    // Drain stderr on its own thread so it runs concurrently with stdout
    // forwarding. Reading stderr only after stdout EOF used to deadlock: a CLI
    // that writes >~64KB to stderr mid-stream fills the pipe buffer, blocks on
    // the write, and stops producing stdout — so forward_lines waits forever.
    let stderr_handle = thread::spawn(move || capture_stderr(stderr));

    thread::spawn(move || {
        forward_lines(&app_clone, &run_id_owned, stdout);
        let stderr_buf = stderr_handle.join().unwrap_or_default();
        let exit_code = wait_and_remove(&slot, &registry_clone, &run_id_owned);
        let _ = app_clone.emit(
            EVENT_NAME,
            TurnEventEnvelope {
                run_id: run_id_owned.clone(),
                event: TurnEventPayload::End {
                    exit_code,
                    stderr: stderr_buf,
                },
            },
        );
        drop(lease_guard);
    });

    Ok(args.run_id.to_string())
}

#[tauri::command]
pub async fn turn_spawn(
    app: AppHandle,
    state: State<'_, TurnRegistry>,
    leases: State<'_, crate::worktree_writer::WriterLeases>,
    args: SpawnArgs,
) -> Result<String, TurnError> {
    let binary = args.binary.as_deref().unwrap_or("claude");
    let permission_mode = args
        .permission_mode
        .as_deref()
        .unwrap_or("default")
        .to_string();

    spawn_one(
        &app,
        &state.0,
        &leases.0,
        SpawnOneArgs {
            run_id: &args.run_id,
            binary,
            model: &args.model,
            working_dir: &args.working_dir,
            writable_roots: &args.writable_roots,
            query_socket_directory: if crate::query_bridge::is_serving() {
                crate::query_bridge::socket_directory().and_then(|path| path.to_str())
            } else {
                None
            },
            prompt: &args.prompt,
            permission_mode: &permission_mode,
            allowed_tools: &args.allowed_tools,
            disallowed_tools: &args.disallowed_tools,
            resume_session_id: args.resume_session_id.as_deref(),
            system_prompt: args.system_prompt.as_deref(),
            effort: args.effort.as_deref(),
            api_key_env: args.api_key_env.as_deref(),
            credential_id: args.credential_id.as_deref(),
            workspace_id: args.workspace_id.as_deref(),
            session_id: args.session_id.as_deref(),
            mount_id: args.mount_id.as_deref(),
            cursor_max_mode: args.cursor_max_mode,
            writer_lease: args.writer_lease.as_ref(),
        },
    )
}

#[tauri::command]
pub async fn turn_list_live(state: State<'_, TurnRegistry>) -> Result<Vec<String>, TurnError> {
    let map = state.0.lock().map_err(|_| TurnError::Poisoned)?;
    Ok(map.keys().cloned().collect())
}

#[tauri::command]
pub async fn turn_cancel(state: State<'_, TurnRegistry>, run_id: String) -> Result<(), TurnError> {
    let map = state.0.lock().map_err(|_| TurnError::Poisoned)?;
    let slot = map
        .get(&run_id)
        .cloned()
        .ok_or_else(|| TurnError::NotFound(run_id.clone()))?;
    drop(map);

    if let Ok(mut guard) = slot.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
        }
    }
    Ok(())
}

fn forward_lines(app: &AppHandle, run_id: &str, stdout: ChildStdout) {
    let mut reader = BufReader::new(stdout);
    let mut buf: Vec<u8> = Vec::new();
    loop {
        buf.clear();
        // read_until + from_utf8_lossy instead of BufRead::lines(): lines()
        // yields Err on the first non-UTF8 byte, and the old code `break`ed on
        // that, abandoning the rest of the turn. A stray byte in passthrough
        // tool output must not truncate the stream.
        match reader.read_until(b'\n', &mut buf) {
            Ok(0) => break,
            Ok(_) => {
                while matches!(buf.last(), Some(b'\n') | Some(b'\r')) {
                    buf.pop();
                }
                let line = String::from_utf8_lossy(&buf).into_owned();
                let _ = app.emit(
                    EVENT_NAME,
                    TurnEventEnvelope {
                        run_id: run_id.to_string(),
                        event: TurnEventPayload::Line { line },
                    },
                );
            }
            Err(err) => {
                let _ = app.emit(
                    EVENT_NAME,
                    TurnEventEnvelope {
                        run_id: run_id.to_string(),
                        event: TurnEventPayload::Error {
                            message: err.to_string(),
                        },
                    },
                );
                break;
            }
        }
    }
}

fn capture_stderr(mut stderr: ChildStderr) -> String {
    let mut buf = String::new();
    let _ = stderr.read_to_string(&mut buf);
    buf
}

fn wait_and_remove(slot: &ChildSlot, registry: &ChildRegistry, run_id: &str) -> Option<i32> {
    let exit = {
        let mut guard = slot.lock().ok()?;
        let child = guard.as_mut()?;
        child.wait().ok().and_then(|status| status.code())
    };
    if let Ok(mut map) = registry.lock() {
        map.remove(run_id);
    }
    exit
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_refuses_a_writer_without_an_owned_lease() {
        let leases = crate::worktree_writer::WriterLeases::new();
        let binding = WriterLeaseBinding {
            path: "/repo/one".to_string(),
            holder: "agent-1".to_string(),
            token: "stale-token".to_string(),
        };
        let mut command = Command::new("/bin/echo");
        let result = spawn_leased_child(&mut command, &leases.0, Some(&binding), "run-1", || {});
        assert!(matches!(result, Err(TurnError::WriterLeaseNotOwned)));
    }

    #[test]
    fn turn_registry_default_is_empty() {
        let registry = TurnRegistry::new();
        let map = registry.0.lock().unwrap();
        assert!(map.is_empty());
    }

    #[test]
    fn spawn_one_args_fields_accessible() {
        let allowed: Vec<String> = vec!["Bash".to_string()];
        let disallowed: Vec<String> = vec![];
        let args = SpawnOneArgs {
            run_id: "run-1",
            binary: "echo",
            model: "claude-3",
            working_dir: "/tmp",
            writable_roots: &[],
            query_socket_directory: Some("/tmp/goodboy-query"),
            prompt: "hello",
            permission_mode: "default",
            allowed_tools: &allowed,
            disallowed_tools: &disallowed,
            resume_session_id: None,
            system_prompt: None,
            effort: None,
            api_key_env: None,
            credential_id: None,
            workspace_id: None,
            session_id: None,
            mount_id: None,
            cursor_max_mode: false,
            writer_lease: None,
        };
        assert_eq!(args.run_id, "run-1");
        assert_eq!(args.binary, "echo");
        assert_eq!(args.allowed_tools, &["Bash".to_string()]);
    }

    fn make_args<'a>(
        resume: Option<&'a str>,
        system_prompt: Option<&'a str>,
        empty: &'a [String],
    ) -> SpawnOneArgs<'a> {
        SpawnOneArgs {
            run_id: "run-1",
            binary: "claude",
            model: "claude-3",
            working_dir: "/tmp",
            writable_roots: empty,
            query_socket_directory: Some("/tmp/goodboy-query"),
            prompt: "hi",
            permission_mode: "default",
            allowed_tools: empty,
            disallowed_tools: empty,
            resume_session_id: resume,
            system_prompt,
            effort: None,
            api_key_env: None,
            credential_id: None,
            workspace_id: None,
            session_id: None,
            mount_id: None,
            cursor_max_mode: false,
            writer_lease: None,
        }
    }

    #[test]
    fn claude_args_omit_resume_and_system_prompt_when_none() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        let cli = build_provider_cli_args("claude", &args);
        assert!(!cli.contains(&"--resume".to_string()));
        assert!(!cli.contains(&"--append-system-prompt".to_string()));
    }

    #[test]
    fn claude_args_include_resume_before_prompt() {
        let empty: Vec<String> = vec![];
        let args = make_args(Some("sess-abc"), None, &empty);
        let cli = build_provider_cli_args("claude", &args);
        let resume_idx = cli.iter().position(|a| a == "--resume").expect("--resume");
        let p_idx = cli.iter().position(|a| a == "-p").expect("-p");
        assert!(resume_idx < p_idx, "--resume must precede -p");
        assert_eq!(cli[resume_idx + 1], "sess-abc");
    }

    #[test]
    fn claude_args_include_system_prompt() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, Some("you are a planner"), &empty);
        let cli = build_provider_cli_args("claude", &args);
        let idx = cli
            .iter()
            .position(|a| a == "--append-system-prompt")
            .expect("--append-system-prompt");
        assert_eq!(cli[idx + 1], "you are a planner");
    }

    #[test]
    fn claude_args_include_effort_when_set() {
        let empty: Vec<String> = vec![];
        let mut args = make_args(None, None, &empty);
        args.effort = Some("xhigh");
        let cli = build_provider_cli_args("claude", &args);
        let idx = cli.iter().position(|a| a == "--effort").expect("--effort");
        assert_eq!(cli[idx + 1], "xhigh");
    }

    #[test]
    fn claude_args_omit_effort_when_none() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        let cli = build_provider_cli_args("claude", &args);
        assert!(!cli.contains(&"--effort".to_string()));
    }

    #[test]
    fn claude_args_isolate_user_settings() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        let cli = build_provider_cli_args("claude", &args);
        let idx = cli
            .iter()
            .position(|a| a == "--setting-sources")
            .expect("--setting-sources");
        assert_eq!(cli[idx + 1], "project,local");
    }

    #[test]
    fn claude_args_never_use_bare() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, Some("sp"), &empty);
        let cli = build_provider_cli_args("claude", &args);
        assert!(!cli.iter().any(|a| a == "--bare"));
    }

    #[test]
    fn claude_args_always_deny_mcp_tools() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        let cli = build_provider_cli_args("claude", &args);
        let idx = cli
            .iter()
            .position(|arg| arg == "--disallowedTools")
            .expect("--disallowedTools");
        assert_eq!(cli[idx + 1], "mcp__*");
    }

    #[test]
    fn claude_args_append_mcp_tools_to_existing_denies() {
        let empty: Vec<String> = vec![];
        let disallowed = vec!["Bash".to_string(), "WebFetch".to_string()];
        let mut args = make_args(None, None, &empty);
        args.disallowed_tools = &disallowed;
        let cli = build_provider_cli_args("claude", &args);
        let idx = cli
            .iter()
            .position(|arg| arg == "--disallowedTools")
            .expect("--disallowedTools");
        assert_eq!(cli[idx + 1], "Bash,WebFetch,mcp__*");
    }

    #[test]
    fn claude_args_do_not_duplicate_mcp_tools_deny() {
        let empty: Vec<String> = vec![];
        let disallowed = vec!["mcp__*".to_string(), "Bash".to_string()];
        let mut args = make_args(None, None, &empty);
        args.disallowed_tools = &disallowed;
        let cli = build_provider_cli_args("claude", &args);
        let idx = cli
            .iter()
            .position(|arg| arg == "--disallowedTools")
            .expect("--disallowedTools");
        assert_eq!(cli[idx + 1], "Bash,mcp__*");
    }

    #[test]
    fn cursor_and_codex_args_do_not_deny_mcp_tools() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        for binary in ["cursor-agent", "codex"] {
            let cli = build_provider_cli_args(binary, &args);
            assert!(!cli
                .windows(2)
                .any(|pair| pair[0] == "--disallowedTools" && pair[1].contains("mcp__*")));
        }
    }

    #[test]
    fn claude_args_ignore_writable_directories() {
        let empty: Vec<String> = vec![];
        let roots = vec!["/repo/one/.git".to_string()];
        let mut args = make_args(None, None, &empty);
        args.writable_roots = &roots;
        let cli = build_provider_cli_args("claude", &args);
        assert!(!cli.iter().any(|arg| arg == "--add-dir"));
    }

    #[test]
    fn codex_args_use_cd_not_cwd() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        let cli = build_provider_cli_args("codex", &args);
        assert!(cli.iter().any(|a| a == "--cd"));
        assert!(!cli.iter().any(|a| a == "--cwd"));
        let idx = cli.iter().position(|a| a == "--cd").expect("--cd");
        assert_eq!(cli[idx + 1], "/tmp");
    }

    #[test]
    fn codex_args_always_skip_git_repo_check() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        let cli = build_provider_cli_args("codex", &args);
        assert!(cli.iter().any(|a| a == "--skip-git-repo-check"));
    }

    #[test]
    fn codex_args_default_to_workspace_write_sandbox() {
        let empty: Vec<String> = vec![];
        let roots = vec!["/repo/one/.git".to_string(), "/repo/two/.git".to_string()];
        let mut args = make_args(None, None, &empty);
        args.writable_roots = &roots;
        let cli = build_provider_cli_args("codex", &args);
        let idx = cli.iter().position(|a| a == "-s").expect("-s");
        assert_eq!(cli[idx + 1], "workspace-write");
        assert!(cli.windows(2).any(|pair| {
            pair[0] == "-c" && pair[1] == "sandbox_workspace_write.network_access=true"
        }));
        let added_directories: Vec<&str> = cli
            .windows(2)
            .filter(|pair| pair[0] == "--add-dir")
            .map(|pair| pair[1].as_str())
            .collect();
        assert_eq!(
            added_directories,
            vec!["/repo/one/.git", "/repo/two/.git", "/tmp/goodboy-query"]
        );
        assert!(!cli
            .iter()
            .any(|a| a == "--dangerously-bypass-approvals-and-sandbox"));
    }

    #[test]
    fn codex_args_add_sibling_worktrees_without_their_parent_directory() {
        let empty: Vec<String> = vec![];
        let roots = vec![
            "/repo/one/.goodboy/worktrees/second".to_string(),
            "/repo/one/.git".to_string(),
        ];
        let mut args = make_args(None, None, &empty);
        args.working_dir = "/repo/one/.goodboy/worktrees/first";
        args.writable_roots = &roots;
        let cli = build_provider_cli_args("codex", &args);
        let added_directories: Vec<&str> = cli
            .windows(2)
            .filter(|pair| pair[0] == "--add-dir")
            .map(|pair| pair[1].as_str())
            .collect();

        assert_eq!(
            added_directories,
            vec![
                "/repo/one/.goodboy/worktrees/second",
                "/repo/one/.git",
                "/tmp/goodboy-query"
            ]
        );
        assert!(!added_directories.contains(&"/repo/one"));
        assert!(!added_directories.contains(&"/repo/one/.goodboy/worktrees"));
    }

    #[test]
    fn codex_args_include_reasoning_effort_when_set() {
        let empty: Vec<String> = vec![];
        let mut args = make_args(None, None, &empty);
        args.effort = Some("high");
        let cli = build_provider_cli_args("codex", &args);
        assert!(cli
            .windows(2)
            .any(|pair| pair[0] == "-c" && pair[1] == "model_reasoning_effort=\"high\""));
    }

    #[test]
    fn codex_args_omit_reasoning_effort_when_none() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        let cli = build_provider_cli_args("codex", &args);
        assert!(!cli.iter().any(|a| a.starts_with("model_reasoning_effort")));
    }

    #[test]
    fn opencode_args_include_variant_and_session() {
        let empty: Vec<String> = vec![];
        let mut args = make_args(Some("ses_123"), None, &empty);
        args.model = "opencode/big-pickle";
        args.effort = Some("high");
        let cli = build_provider_cli_args("opencode", &args);
        assert_eq!(
            cli,
            vec![
                "run",
                "--format",
                "json",
                "-m",
                "opencode/big-pickle",
                "--dir",
                "/tmp",
                "--dangerously-skip-permissions",
                "--variant",
                "high",
                "--session",
                "ses_123",
                "--",
                "hi",
            ]
        );
    }

    #[test]
    fn openrouter_args_keep_the_pre_slugged_model() {
        let empty: Vec<String> = vec![];
        let mut args = make_args(None, None, &empty);
        args.model = "openrouter/openai/gpt-5.4";
        let cli = build_provider_cli_args("openrouter", &args);
        assert_eq!(
            cli,
            vec![
                "run",
                "--format",
                "json",
                "-m",
                "openrouter/openai/gpt-5.4",
                "--dir",
                "/tmp",
                "--dangerously-skip-permissions",
                "--",
                "hi",
            ]
        );
    }

    #[test]
    fn codex_args_bypass_replaces_sandbox_flag() {
        let empty: Vec<String> = vec![];
        let mut args = make_args(None, None, &empty);
        args.binary = "codex";
        args.permission_mode = "bypassPermissions";
        let cli = build_provider_cli_args("codex", &args);
        assert!(cli
            .iter()
            .any(|a| a == "--dangerously-bypass-approvals-and-sandbox"));
        assert!(!cli.iter().any(|a| a == "-s"));
        assert!(!cli.iter().any(|a| a == "--add-dir"));
        assert!(!cli.windows(2).any(|pair| {
            pair[0] == "-c" && pair[1] == "sandbox_workspace_write.network_access=true"
        }));
        assert!(cli.iter().any(|a| a == "--skip-git-repo-check"));
    }

    #[test]
    fn cursor_and_codex_ignore_resume_and_system_prompt() {
        let empty: Vec<String> = vec![];
        let args = make_args(Some("sid"), Some("sp"), &empty);
        let cli_cursor = build_provider_cli_args("cursor-agent", &args);
        let cli_codex = build_provider_cli_args("codex", &args);
        assert!(!cli_cursor
            .iter()
            .any(|a| a == "--resume" || a == "--append-system-prompt"));
        assert!(!cli_codex
            .iter()
            .any(|a| a == "--resume" || a == "--append-system-prompt"));
    }

    #[test]
    fn max_mode_config_dir_is_cursor_only_and_opt_in() {
        assert!(max_mode_config_dir_for("claude", true).is_none());
        assert!(max_mode_config_dir_for("/usr/local/bin/cursor-agent", false).is_none());
    }

    #[test]
    fn gemini_args_use_short_model_flag() {
        let empty: Vec<String> = vec![];
        let args = make_args(None, None, &empty);
        let cli = build_provider_cli_args("agy", &args);
        let index = cli.iter().position(|arg| arg == "-m").expect("-m");
        assert_eq!(cli[index + 1], "claude-3");
        assert!(!cli.iter().any(|arg| arg == "--model"));
    }

    #[test]
    #[ignore = "requires real codex binary + active login; opt in via GOODBOY_TEST_REAL_CODEX=1"]
    fn codex_real_spawn_emits_json_events() {
        if std::env::var("GOODBOY_TEST_REAL_CODEX")
            .map(|v| v.is_empty())
            .unwrap_or(true)
        {
            return;
        }
        let allowed: Vec<String> = vec![];
        let disallowed: Vec<String> = vec![];
        let args = SpawnOneArgs {
            run_id: "smoke-test",
            binary: "codex",
            model: "gpt-5.5",
            working_dir: "/tmp",
            writable_roots: &[],
            query_socket_directory: Some("/tmp/goodboy-query"),
            prompt: "say hello",
            permission_mode: "default",
            allowed_tools: &allowed,
            disallowed_tools: &disallowed,
            resume_session_id: None,
            system_prompt: None,
            effort: None,
            api_key_env: None,
            credential_id: None,
            workspace_id: None,
            session_id: None,
            mount_id: None,
            cursor_max_mode: false,
            writer_lease: None,
        };
        let cli = build_provider_cli_args("codex", &args);
        let out = std::process::Command::new("codex")
            .args(&cli)
            .output()
            .expect("spawn codex");

        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(
            out.status.success(),
            "codex exited {:?}\nstdout: {}\nstderr: {}",
            out.status.code(),
            stdout,
            stderr
        );
        assert!(
            stdout.contains(r#""type":"thread.started""#),
            "missing thread.started in stdout: {}",
            stdout
        );
        assert!(
            stdout.contains(r#""type":"item.completed""#),
            "missing item.completed in stdout: {}",
            stdout
        );
        assert!(
            stdout.contains(r#""type":"turn.completed""#),
            "missing turn.completed in stdout: {}",
            stdout
        );
    }
}
