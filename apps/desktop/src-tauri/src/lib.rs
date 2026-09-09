mod attachment;
mod aux_spawn;
mod bitbucket;
mod boot_breadcrumb;
mod bridge;
mod budget;
mod config_export;
mod cursor_config;
mod db;
mod editor;
mod explore;
mod external_terminal;
mod file_versions;
mod github;
mod gitlab;
mod integration_credentials;
mod jira;
mod linear;
mod local_image;
mod path_env;
mod permissions;
mod planner;
mod profile_file;
mod project_scripts;
mod provider_credentials;
mod provider_lifecycle;
mod providers;
mod qa_preview;
mod query_bridge;
mod releases;
mod remote_image;
mod repo;
mod scratch_dir;
mod scripts;
mod secrets;
mod sentry;
mod session_dir;
mod settings_overrides;
mod skills;
mod slack;
mod summarize;
mod terminal;
mod turn;
mod util;
mod workflows;
mod worktree;
mod worktree_writer;

pub use secrets::read as read_secret;

use std::sync::Mutex;

#[cfg(target_os = "macos")]
fn suppress_webkit_media_remote() {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    unsafe {
        let defaults: *mut AnyObject = msg_send![class!(NSUserDefaults), standardUserDefaults];
        let key: *mut AnyObject = msg_send![
            class!(NSString),
            stringWithUTF8String: c"WebKitMediaRemoteEnabled".as_ptr()
        ];
        let no: i8 = 0;
        let _: () = msg_send![defaults, setBool: no, forKey: key];
    }
}

/// Kills every child process the app still owns. Idempotent: each registry is
/// drained, so a second call after the window teardown finds nothing left.
fn drain_child_processes(app: &tauri::AppHandle) {
    use tauri::Manager;
    scripts::shutdown(&app.state::<scripts::ScriptRegistry>());
    terminal::shutdown(&app.state::<terminal::TerminalRegistry>());
    provider_lifecycle::shutdown(&app.state::<provider_lifecycle::ProviderLifecycleRegistry>());
    query_bridge::shutdown();
}

pub fn run_query_cli() -> Option<i32> {
    query_bridge::run_cli()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    boot_breadcrumb::record("process-start", Some("start"));
    #[cfg(target_os = "macos")]
    suppress_webkit_media_remote();
    let database = match db::open() {
        Ok(database) => Some(database),
        Err(error) => {
            boot_breadcrumb::record("error", Some("error"));
            eprintln!("[goodboy] the local database could not be opened: {error}");
            None
        }
    };
    let bridge_state = bridge::BridgeState::new().expect("failed to init companion bridge");
    let (detection_gate, detection_opener) = providers::detection_gate();
    let provider_state =
        providers::ProviderState(Mutex::new(providers::initial_status("anthropic", "claude")));
    let cursor_state = providers::CursorState(Mutex::new(providers::initial_status(
        "cursor",
        "cursor-agent",
    )));
    let codex_state =
        providers::CodexState(Mutex::new(providers::initial_status("codex", "codex")));
    let gemini_state =
        providers::GeminiState(Mutex::new(providers::initial_status("gemini", "agy")));
    let opencode_state = providers::OpencodeState(Mutex::new(providers::initial_status(
        "opencode", "opencode",
    )));
    let turn_registry = turn::TurnRegistry::new();
    let summarize_registry = summarize::SummarizeRegistry::new();
    let script_registry = scripts::ScriptRegistry::new();
    let terminal_registry = terminal::TerminalRegistry::new();
    let writer_leases = worktree_writer::WriterLeases::new();
    let provider_lifecycle_registry = provider_lifecycle::ProviderLifecycleRegistry::new();
    let linear_token_cache = linear::LinearTokenCache::new();
    let sentry_token_cache = sentry::SentryTokenCache::new();
    let gitlab_token_cache = gitlab::GitlabTokenCache::new();
    let jira_token_cache = jira::JiraTokenCache::new();
    let bitbucket_token_cache = bitbucket::BitbucketTokenCache::new();
    let slack_token_cache = slack::SlackTokenCache::new();

    let builder = tauri::Builder::default()
        .on_window_event(|window, event| {
            use tauri::Manager;
            if !matches!(event, tauri::WindowEvent::Destroyed) {
                return;
            }
            let app = window.app_handle();
            let survivors = app
                .webview_windows()
                .keys()
                .filter(|label| label.as_str() != window.label())
                .count();
            if survivors == 0 {
                drain_child_processes(app);
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init());

    let builder = match database {
        Some(database) => builder.manage(database),
        None => builder,
    };

    builder
        .manage(bridge_state)
        .manage(provider_state)
        .manage(cursor_state)
        .manage(codex_state)
        .manage(gemini_state)
        .manage(opencode_state)
        .manage(detection_gate)
        .manage(turn_registry)
        .manage(writer_leases)
        .manage(summarize_registry)
        .manage(script_registry)
        .manage(terminal_registry)
        .manage(provider_lifecycle_registry)
        .manage(linear_token_cache)
        .manage(sentry_token_cache)
        .manage(gitlab_token_cache)
        .manage(jira_token_cache)
        .manage(bitbucket_token_cache)
        .manage(slack_token_cache)
        .setup(move |app| {
            use tauri::Manager;
            providers::spawn_startup_detection(app.handle().clone(), detection_opener);
            query_bridge::start(app.handle().clone());
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let windows = app.webview_windows();
            if !windows.is_empty() {
                boot_breadcrumb::record("window-created", Some("ok"));
                for window in windows.values() {
                    let _ = window.show();
                }
                boot_breadcrumb::record("webview-attached", Some("ok"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secrets::secret_set,
            secrets::secret_delete,
            editor::detect_editors,
            editor::open_in_editor,
            editor::open_file_in_workspace,
            editor::open_url,
            remote_image::fetch_remote_image,
            local_image::local_image_read,
            releases::releases_list,
            explore::explore_list,
            explore::explore_read,
            explore::explore_open,
            boot_breadcrumb::boot_breadcrumb,
            db::db_exec,
            db::db_execute,
            db::db_list_migration_snapshots,
            db::db_path,
            db::db_remove_migration_snapshot,
            db::db_select,
            db::db_wipe,
            bridge::bridge_start,
            bridge::bridge_status,
            bridge::bridge_command_result,
            bridge::bridge_revoke,
            profile_file::workspace_profile_project,
            session_dir::session_dir_create,
            session_dir::session_dir_remove,
            session_dir::session_dir_exists,
            scratch_dir::scratch_dir_prepare,
            scratch_dir::scratch_dir_remove,
            worktree::worktree_create,
            worktree::worktree_inspect,
            worktree::worktree_git_common_dir,
            worktree::worktree_remove_checked,
            worktree::worktree_detach_assessment,
            worktree::worktree_directory_size,
            worktree::worktree_tidy_goodboy,
            worktree::worktree_orphans,
            worktree::worktree_orphan_remove,
            worktree::worktree_list,
            worktree::worktree_remote_url,
            worktree::worktree_diff,
            worktree::worktree_diff_file,
            worktree::worktree_changed_files,
            worktree::worktree_commits,
            worktree::worktree_is_ancestor,
            worktree::worktree_remote_head,
            worktree::worktree_diff_commit,
            worktree::worktree_diff_range,
            worktree::worktree_scratch_add,
            worktree::worktree_scratch_remove,
            worktree::worktree_amend_commit,
            worktree::worktree_squash_commits,
            worktree::worktree_diff_working,
            worktree::worktree_status,
            worktree::checkout_fast_forward,
            worktree::worktree_list_local_branches,
            worktree::worktree_list_branch_names,
            worktree::worktree_change_branch,
            worktree::worktree_integrate_candidate,
            worktree::worktree_quarantine_candidate,
            providers::get_provider_status,
            providers::refresh_provider_status,
            providers::get_cursor_status,
            providers::refresh_cursor_status,
            providers::get_codex_status,
            providers::refresh_codex_status,
            providers::get_gemini_status,
            providers::refresh_gemini_status,
            providers::get_opencode_status,
            providers::get_openrouter_status,
            providers::get_moonshot_status,
            providers::refresh_opencode_status,
            providers::refresh_openrouter_status,
            providers::refresh_moonshot_status,
            providers::check_provider_auth,
            provider_credentials::provider_api_key_validate,
            provider_lifecycle::provider_lifecycle_run,
            provider_lifecycle::provider_lifecycle_write,
            provider_lifecycle::provider_lifecycle_resize,
            provider_lifecycle::provider_lifecycle_cancel,
            external_terminal::open_command_in_external_terminal,
            turn::turn_spawn,
            turn::turn_cancel,
            turn::turn_list_live,
            worktree_writer::worktree_writer_acquire,
            worktree_writer::worktree_writer_release,
            worktree_writer::worktree_writer_cancel,
            worktree_writer::worktree_writer_abandon,
            worktree_writer::worktree_writer_status,
            query_bridge::query_bridge_serving,
            query_bridge::project::project_materialize_result,
            query_bridge::mount::mount_command_result,
            attachment::attachment_write,
            attachment::attachment_read,
            attachment::attachment_delete,
            attachment::attachment_read_dropped,
            attachment::attachment_cleanup_orphans,
            attachment::bug_report_stage_images,
            attachment::bug_report_discard_images,
            attachment::bug_report_reveal_images,
            file_versions::file_versions_begin_snapshot,
            file_versions::file_versions_finalize_snapshot,
            file_versions::file_versions_list_staged_snapshots,
            file_versions::file_versions_restore,
            file_versions::file_versions_delete,
            file_versions::file_versions_purge_session,
            summarize::summarize_session,
            summarize::summarize_cancel,
            planner::planner_run,
            repo::validate_git_repo,
            repo::project_git_status,
            repo::repo_init_with_remote,
            repo::repo_init,
            repo::scan_child_repos,
            budget::budget_rule_upsert,
            budget::budget_rule_list,
            budget::budget_rule_delete,
            budget::session_budget_set,
            budget::session_budget_get,
            budget::budget_alerts_list,
            budget::budget_alert_dismiss,
            budget::budget_emit_alerts,
            budget::check_provider_budget,
            skills::skill_list,
            skills::skill_get,
            skills::skill_upsert,
            skills::skill_delete,
            skills::skill_rescan,
            skills::skill_run_script,
            project_scripts::project_scripts_scan,
            scripts::workspace_script_run,
            scripts::workspace_script_run_adhoc,
            scripts::workspace_script_list_live,
            scripts::workspace_script_cancel,
            terminal::terminal_open,
            terminal::terminal_list_live,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            workflows::workflow_list,
            workflows::workflows_for_session,
            workflows::workflow_upsert,
            workflows::workflow_delete,
            workflows::step_def_list,
            workflows::step_def_upsert,
            workflows::step_def_delete,
            workflows::agent_list_for_session,
            workflows::agent_insert,
            workflows::agent_update_status,
            workflows::agent_set_provider_session_id,
            workflows::agent_set_kind,
            workflows::agent_set_verbosity,
            workflows::agent_mark_viewed,
            workflows::agent_set_done,
            workflows::workspaces_with_unread,
            permissions::permission_rule_list,
            permissions::permission_rule_upsert,
            permissions::permission_audit_insert,
            permissions::permission_audit_retry_enqueue,
            permissions::permission_audit_retry_drain,
            permissions::permission_audit_retry_update,
            permissions::permission_audit_retry_delete,
            settings_overrides::get_workspace_overrides,
            settings_overrides::set_workspace_overrides,
            settings_overrides::get_session_overrides,
            settings_overrides::set_session_overrides,
            config_export::export_config_to_file,
            config_export::import_config_from_file,
            github::gh_status,
            github::gh_set_token,
            github::gh_clear_token,
            github::gh_run,
            github::git_push,
            github::gh_pr_diff,
            integration_credentials::integration_credentials_adopt,
            integration_credentials::integration_credential_forget,
            integration_credentials::integration_credential_has_secret,
            linear::linear_validate_connection,
            linear::linear_connect,
            linear::linear_fetch_assigned_issues,
            linear::linear_fetch_issue,
            linear::linear_fetch_issue_comments,
            linear::linear_create_comment,
            linear::linear_update_issue,
            sentry::sentry_validate_connection,
            sentry::sentry_connect,
            sentry::sentry_fetch_issues,
            sentry::sentry_fetch_issue,
            sentry::sentry_fetch_issue_detail,
            gitlab::gitlab_validate_connection,
            gitlab::gitlab_connect,
            gitlab::gitlab_fetch_assigned_issues,
            gitlab::gitlab_fetch_issue,
            gitlab::gitlab_update_issue,
            gitlab::gitlab_list_issue_notes,
            gitlab::gitlab_create_issue_note,
            gitlab::gitlab_fetch_assigned_mrs,
            gitlab::gitlab_fetch_project_mrs,
            gitlab::gitlab_mr_for_branch,
            gitlab::gitlab_create_mr,
            gitlab::gitlab_merge_mr,
            gitlab::gitlab_mr_diff,
            gitlab::gitlab_mr_diff_refs,
            gitlab::gitlab_create_mr_discussion,
            gitlab::gitlab_create_mr_note,
            gitlab::gitlab_list_mr_discussions,
            gitlab::gitlab_reply_to_mr_discussion,
            gitlab::gitlab_resolve_mr_discussion,
            gitlab::gitlab_mr_approval_state,
            gitlab::gitlab_approve_mr,
            gitlab::gitlab_unapprove_mr,
            gitlab::gitlab_update_mr_state,
            jira::jira_validate_connection,
            jira::jira_connect,
            jira::jira_list_issues,
            jira::jira_get_issue,
            jira::jira_list_comments,
            jira::jira_create_comment,
            jira::jira_update_issue,
            jira::jira_set_assignee,
            jira::jira_list_assignable_users,
            jira::jira_list_transitions,
            jira::jira_transition_issue,
            bitbucket::bitbucket_validate_connection,
            bitbucket::bitbucket_connect,
            bitbucket::bitbucket_list_pull_requests,
            bitbucket::bitbucket_get_pull_request,
            bitbucket::bitbucket_pull_request_diff,
            bitbucket::bitbucket_list_pull_request_comments,
            bitbucket::bitbucket_list_pull_request_statuses,
            bitbucket::bitbucket_pull_request_for_branch,
            bitbucket::bitbucket_approve_pull_request,
            bitbucket::bitbucket_unapprove_pull_request,
            bitbucket::bitbucket_request_changes,
            bitbucket::bitbucket_unrequest_changes,
            bitbucket::bitbucket_merge_pull_request,
            bitbucket::bitbucket_decline_pull_request,
            bitbucket::bitbucket_create_pull_request_comment,
            bitbucket::bitbucket_reply_to_pull_request_comment,
            slack::slack_validate_connection,
            slack::slack_connect,
            slack::slack_list_channels,
            slack::slack_list_thread_heads,
            slack::slack_get_thread,
            slack::slack_get_permalink,
            slack::slack_list_users,
            slack::slack_post_reply,
            slack::slack_add_reaction,
            qa_preview::qa_deciding_workflow_runs,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                drain_child_processes(app);
            }
        });
}
