use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use super::dispatch::Scope;
use crate::db::Db;
use crate::github::{read_token, run_gh, run_git_push, GhRunResult};

const NOT_CONNECTED: &str =
    "github is not connected: paste a personal API key in Goodboy, or sign in with `gh auth login`";
const NO_SESSION: &str = "no session context: this command only works inside a Goodboy agent turn";
const NO_MOUNT: &str = "this session mounts no repository";
const BRANCH_REFUSED: &str =
    "push always pushes this session's own mount branch; drop the branch argument";
const NO_BRANCH: &str = "this mount has no branch to push";

const PR_LIST_FIELDS: &str = "number,title,state,isDraft,headRefName,url,author";
const PR_VIEW_FIELDS: &str =
    "number,title,state,isDraft,headRefName,baseRefName,url,author,body,mergeable,reviewDecision";
const PR_CHECK_FIELDS: &str = "name,state,bucket,link";
const ISSUE_LIST_FIELDS: &str = "number,title,state,url,updatedAt";
const ISSUE_VIEW_FIELDS: &str = "number,title,state,body,author,url,assignees,labels";

const REVIEW_THREADS_QUERY: &str = "query($owner:String!,$name:String!,$pr:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$pr){
      reviewThreads(first:50){
        nodes{
          id
          isResolved
          isOutdated
          path
          line
          comments(first:50){
            nodes{
              author{login}
              body
              createdAt
              url
            }
          }
        }
      }
    }
  }
}";

const RESOLVE_THREAD_MUTATION: &str = "mutation($threadId:ID!){
  resolveReviewThread(input:{threadId:$threadId}){
    thread{ id isResolved }
  }
}";

const THREAD_REPLY_MUTATION: &str = "mutation($threadId:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$threadId,body:$body}){
    comment{ id url }
  }
}";

struct Mount {
    path: String,
    branch: String,
    repo_slug: Option<String>,
    project_id: Option<String>,
}

struct Ctx {
    workspace: String,
    project: Option<String>,
    mount: Mount,
}

fn credential_gate(has_token: bool, is_gh_cli_signed_in: bool) -> Result<(), String> {
    if has_token || is_gh_cli_signed_in {
        return Ok(());
    }
    Err(NOT_CONNECTED.to_string())
}

fn branch_override_refusal(branch: Option<&str>) -> Result<(), String> {
    match branch {
        Some(_) => Err(BRANCH_REFUSED.to_string()),
        None => Ok(()),
    }
}

fn merge_method_flag(method: Option<&str>) -> Result<&'static str, String> {
    match method {
        None | Some("squash") => Ok("--squash"),
        Some("merge") => Ok("--merge"),
        Some("rebase") => Ok("--rebase"),
        Some(other) => Err(format!(
            "unknown merge method: {}. use squash, merge or rebase",
            other
        )),
    }
}

fn strs(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_string()).collect()
}

fn with_selector(mut args: Vec<String>, number: Option<i64>, tail: &[&str]) -> Vec<String> {
    if let Some(number) = number {
        args.push(number.to_string());
    }
    args.extend(strs(tail));
    args
}

fn push_args(branch: &str, force_with_lease: bool) -> Vec<String> {
    let mut args = vec!["push".to_string()];
    if force_with_lease {
        args.push("--force-with-lease".to_string());
    }
    args.push("origin".to_string());
    args.push(branch.to_string());
    args
}

fn thread_resolve_args(thread_id: &str) -> Vec<String> {
    vec![
        "api".to_string(),
        "graphql".to_string(),
        "-f".to_string(),
        format!("query={}", RESOLVE_THREAD_MUTATION),
        "-F".to_string(),
        format!("threadId={}", thread_id),
    ]
}

fn thread_reply_args(thread_id: &str, body: &str) -> Vec<String> {
    vec![
        "api".to_string(),
        "graphql".to_string(),
        "-f".to_string(),
        format!("query={}", THREAD_REPLY_MUTATION),
        "-F".to_string(),
        format!("threadId={}", thread_id),
        "-f".to_string(),
        format!("body={}", body),
    ]
}

fn review_threads_args(owner: &str, name: &str, number: i64) -> Vec<String> {
    vec![
        "api".to_string(),
        "graphql".to_string(),
        "-f".to_string(),
        format!("query={}", REVIEW_THREADS_QUERY),
        "-F".to_string(),
        format!("owner={}", owner),
        "-F".to_string(),
        format!("name={}", name),
        "-F".to_string(),
        format!("pr={}", number),
    ]
}

fn split_slug(slug: &str) -> Result<(String, String), String> {
    match slug.split_once('/') {
        Some((owner, name)) if !owner.is_empty() && !name.is_empty() => {
            Ok((owner.to_string(), name.to_string()))
        }
        _ => Err(format!("unusable repository slug: {}", slug)),
    }
}

fn failure(res: &GhRunResult) -> String {
    let detail = res.stderr.trim();
    if detail.is_empty() {
        let fallback = res.stdout.trim();
        if fallback.is_empty() {
            return format!("gh exited with {}", res.exit_code);
        }
        return fallback.to_string();
    }
    detail.to_string()
}

fn json_out(res: GhRunResult) -> Result<Value, String> {
    if res.exit_code != 0 {
        return Err(failure(&res));
    }
    serde_json::from_str(&res.stdout).map_err(|error| error.to_string())
}

fn text_out(res: GhRunResult) -> Result<Value, String> {
    if res.exit_code != 0 {
        return Err(failure(&res));
    }
    Ok(Value::String(res.stdout.trim_end().to_string()))
}

fn done_out(res: GhRunResult) -> Result<Value, String> {
    if res.exit_code != 0 {
        return Err(failure(&res));
    }
    let stdout = res.stdout.trim();
    let stderr = res.stderr.trim();
    let line = match (stdout.is_empty(), stderr.is_empty()) {
        (false, _) => stdout,
        (true, false) => stderr,
        (true, true) => "done",
    };
    Ok(Value::String(line.to_string()))
}

fn checks_out(res: GhRunResult) -> Result<Value, String> {
    match serde_json::from_str::<Value>(&res.stdout) {
        Ok(value) => Ok(value),
        Err(_) if res.exit_code != 0 => Err(failure(&res)),
        Err(error) => Err(error.to_string()),
    }
}

fn graphql_out(res: GhRunResult) -> Result<Value, String> {
    let parsed = serde_json::from_str::<Value>(&res.stdout);
    if let Ok(payload) = &parsed {
        if let Some(message) = payload.pointer("/errors/0/message").and_then(Value::as_str) {
            return Err(message.to_string());
        }
    }
    if res.exit_code != 0 {
        return Err(failure(&res));
    }
    parsed.map_err(|error| error.to_string())
}

fn shape_threads(payload: &Value) -> Value {
    let nodes = payload
        .pointer("/data/repository/pullRequest/reviewThreads/nodes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let threads: Vec<Value> = nodes
        .into_iter()
        .map(|thread| {
            let comments: Vec<Value> = thread
                .pointer("/comments/nodes")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|comment| {
                    json!({
                        "author": comment
                            .pointer("/author/login")
                            .and_then(Value::as_str)
                            .unwrap_or("unknown"),
                        "body": comment.get("body").cloned().unwrap_or(Value::Null),
                        "createdAt": comment.get("createdAt").cloned().unwrap_or(Value::Null),
                        "url": comment.get("url").cloned().unwrap_or(Value::Null),
                    })
                })
                .collect();
            json!({
                "id": thread.get("id").cloned().unwrap_or(Value::Null),
                "isResolved": thread.get("isResolved").cloned().unwrap_or(Value::Null),
                "isOutdated": thread.get("isOutdated").cloned().unwrap_or(Value::Null),
                "path": thread.get("path").cloned().unwrap_or(Value::Null),
                "line": thread.get("line").cloned().unwrap_or(Value::Null),
                "comments": comments,
            })
        })
        .collect();
    Value::Array(threads)
}

fn mount_for(
    app: &AppHandle,
    workspace_id: &str,
    session_id: &str,
    project_id: Option<&str>,
) -> Result<Mount, String> {
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
        None => return Err(format!("unknown session: {}", session_id)),
        Some(owner) if owner != workspace_id => {
            return Err("this session does not belong to the requested workspace".to_string())
        }
        Some(_) => {}
    }
    let mount: Option<(String, String, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT sw.worktree_path, sw.branch, sw.repo_slug, sw.project_id
             FROM session_worktrees sw
             JOIN sessions s ON s.id = sw.session_id
             WHERE sw.session_id = ?1
               AND (?2 IS NULL OR sw.project_id = ?2)
               AND sw.worktree_path IS NOT NULL
               AND sw.is_attached = 1
             ORDER BY CASE WHEN sw.id = s.active_mount_id THEN 0 ELSE 1 END,
                      sw.parallel_index ASC, sw.created_at ASC, sw.id ASC
             LIMIT 1",
            rusqlite::params![session_id, project_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    mount
        .map(|(path, branch, repo_slug, project_id)| Mount {
            path,
            branch,
            repo_slug,
            project_id,
        })
        .ok_or_else(|| NO_MOUNT.to_string())
}

async fn context(app: &AppHandle, scope: &Scope<'_>) -> Result<Ctx, String> {
    if scope.session.is_empty() {
        return Err(NO_SESSION.to_string());
    }
    let mount = mount_for(app, scope.workspace, scope.session, scope.project_id())?;
    let project = match &scope.project {
        Some(project) => Some(project.clone()),
        None => mount.project_id.clone(),
    };
    let workspace = scope.workspace.to_string();
    let gate_workspace = workspace.clone();
    let gate_project = project.clone();
    let (has_token, is_gh_cli_signed_in) = tauri::async_runtime::spawn_blocking(move || {
        let has_token = read_token(Some(&gate_workspace), gate_project.as_deref())
            .filter(|token| !token.is_empty())
            .is_some();
        if has_token {
            return Ok((true, false));
        }
        let signed_in = run_gh(&["auth", "token"], None, None)
            .map(|res| res.exit_code == 0 && !res.stdout.trim().is_empty())
            .map_err(|error| error.to_string())?;
        Ok::<(bool, bool), String>((false, signed_in))
    })
    .await
    .map_err(|error| error.to_string())??;
    credential_gate(has_token, is_gh_cli_signed_in)?;
    Ok(Ctx {
        workspace,
        project,
        mount,
    })
}

impl Ctx {
    async fn gh(&self, args: Vec<String>) -> Result<GhRunResult, String> {
        let workspace = self.workspace.clone();
        let project = self.project.clone();
        let cwd = self.mount.path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let token =
                read_token(Some(&workspace), project.as_deref()).filter(|token| !token.is_empty());
            let refs: Vec<&str> = args.iter().map(String::as_str).collect();
            run_gh(&refs, Some(&cwd), token.as_deref()).map_err(|error| error.to_string())
        })
        .await
        .map_err(|error| error.to_string())?
    }

    async fn current_pr_number(&self) -> Result<i64, String> {
        let res = self.gh(strs(&["pr", "view", "--json", "number"])).await?;
        json_out(res)?
            .get("number")
            .and_then(Value::as_i64)
            .ok_or_else(|| "no pull request found for the current branch".to_string())
    }

    async fn repo_slug(&self) -> Result<String, String> {
        if let Some(slug) = self
            .mount
            .repo_slug
            .as_deref()
            .filter(|slug| !slug.is_empty())
        {
            return Ok(slug.to_string());
        }
        let res = self
            .gh(strs(&["repo", "view", "--json", "nameWithOwner"]))
            .await?;
        json_out(res)?
            .get("nameWithOwner")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "cannot determine the repository of this mount".to_string())
    }
}

pub(super) async fn prs(
    app: &AppHandle,
    scope: &Scope<'_>,
    state: Option<String>,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let state = state.unwrap_or_else(|| "open".to_string());
    let res = ctx
        .gh(strs(&[
            "pr",
            "list",
            "--state",
            &state,
            "--json",
            PR_LIST_FIELDS,
        ]))
        .await?;
    json_out(res)
}

pub(super) async fn pr(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: Option<i64>,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let args = with_selector(strs(&["pr", "view"]), number, &["--json", PR_VIEW_FIELDS]);
    json_out(ctx.gh(args).await?)
}

pub(super) async fn pr_for_branch(
    app: &AppHandle,
    scope: &Scope<'_>,
    branch: String,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let res = ctx
        .gh(strs(&[
            "pr",
            "list",
            "--head",
            &branch,
            "--state",
            "all",
            "--json",
            PR_LIST_FIELDS,
        ]))
        .await?;
    json_out(res)
}

pub(super) async fn pr_diff(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: Option<i64>,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let args = with_selector(strs(&["pr", "diff"]), number, &[]);
    text_out(ctx.gh(args).await?)
}

pub(super) async fn pr_checks(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: Option<i64>,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let args = with_selector(
        strs(&["pr", "checks"]),
        number,
        &["--json", PR_CHECK_FIELDS],
    );
    checks_out(ctx.gh(args).await?)
}

pub(super) async fn pr_comments(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: Option<i64>,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let number = match number {
        Some(number) => number,
        None => ctx.current_pr_number().await?,
    };
    let slug = ctx.repo_slug().await?;
    let (owner, name) = split_slug(&slug)?;
    let res = ctx.gh(review_threads_args(&owner, &name, number)).await?;
    let payload = graphql_out(res)?;
    Ok(shape_threads(&payload))
}

pub(super) async fn issues_assigned(app: &AppHandle, scope: &Scope<'_>) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let res = ctx
        .gh(strs(&[
            "issue",
            "list",
            "--assignee",
            "@me",
            "--state",
            "open",
            "--json",
            ISSUE_LIST_FIELDS,
        ]))
        .await?;
    json_out(res)
}

pub(super) async fn issue(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: i64,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let number = number.to_string();
    let res = ctx
        .gh(strs(&[
            "issue",
            "view",
            &number,
            "--json",
            ISSUE_VIEW_FIELDS,
        ]))
        .await?;
    json_out(res)
}

pub(super) async fn issue_comments(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: i64,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let number = number.to_string();
    let res = ctx
        .gh(strs(&["issue", "view", &number, "--json", "comments"]))
        .await?;
    let payload = json_out(res)?;
    Ok(payload
        .get("comments")
        .cloned()
        .unwrap_or(Value::Array(Vec::new())))
}

pub(super) async fn pr_comment_create(
    app: &AppHandle,
    scope: &Scope<'_>,
    body: String,
    number: Option<i64>,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let args = with_selector(strs(&["pr", "comment"]), number, &["--body", &body]);
    text_out(ctx.gh(args).await?)
}

pub(super) async fn pr_thread_reply(
    app: &AppHandle,
    scope: &Scope<'_>,
    thread: String,
    body: String,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let res = ctx.gh(thread_reply_args(&thread, &body)).await?;
    let payload = graphql_out(res)?;
    payload
        .pointer("/data/addPullRequestReviewThreadReply/comment")
        .cloned()
        .filter(|comment| !comment.is_null())
        .ok_or_else(|| "the reply was not created".to_string())
}

pub(super) async fn pr_thread_resolve(
    app: &AppHandle,
    scope: &Scope<'_>,
    thread: String,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let res = ctx.gh(thread_resolve_args(&thread)).await?;
    let payload = graphql_out(res)?;
    payload
        .pointer("/data/resolveReviewThread/thread")
        .cloned()
        .filter(|thread| !thread.is_null())
        .ok_or_else(|| "the thread was not resolved".to_string())
}

pub(super) async fn pr_ready(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: Option<i64>,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let args = with_selector(strs(&["pr", "ready"]), number, &[]);
    done_out(ctx.gh(args).await?)
}

pub(super) async fn pr_merge(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: Option<i64>,
    method: Option<String>,
) -> Result<Value, String> {
    let flag = merge_method_flag(method.as_deref())?;
    let ctx = context(app, scope).await?;
    let args = with_selector(strs(&["pr", "merge"]), number, &[flag]);
    done_out(ctx.gh(args).await?)
}

pub(super) async fn issue_comment_create(
    app: &AppHandle,
    scope: &Scope<'_>,
    number: i64,
    body: String,
) -> Result<Value, String> {
    let ctx = context(app, scope).await?;
    let number = number.to_string();
    let res = ctx
        .gh(strs(&["issue", "comment", &number, "--body", &body]))
        .await?;
    text_out(res)
}

pub(super) async fn push(
    app: &AppHandle,
    scope: &Scope<'_>,
    branch: Option<String>,
    force_with_lease: bool,
) -> Result<Value, String> {
    branch_override_refusal(branch.as_deref())?;
    let ctx = context(app, scope).await?;
    let branch = ctx.mount.branch.trim().to_string();
    if branch.is_empty() {
        return Err(NO_BRANCH.to_string());
    }
    let args = push_args(&branch, force_with_lease);
    let workspace = ctx.workspace.clone();
    let project = ctx.project.clone();
    let cwd = ctx.mount.path.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let token =
            read_token(Some(&workspace), project.as_deref()).filter(|token| !token.is_empty());
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run_git_push(&refs, &cwd, token.as_deref()).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())??;
    if res.exit_code != 0 {
        return Err(failure(&res));
    }
    let stderr = res.stderr.trim();
    let detail = match stderr.is_empty() {
        true => "pushed".to_string(),
        false => stderr.to_string(),
    };
    Ok(json!({ "branch": branch, "result": detail }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gh_result(stdout: &str, stderr: &str, exit_code: i32) -> GhRunResult {
        GhRunResult {
            stdout: stdout.to_string(),
            stderr: stderr.to_string(),
            exit_code,
        }
    }

    #[test]
    fn a_workspace_without_any_github_credential_gets_a_clear_refusal() {
        let error = credential_gate(false, false).expect_err("no credential");

        assert!(error.contains("github is not connected"));
        assert!(error.contains("gh auth login"));
    }

    #[test]
    fn a_stored_token_or_a_signed_in_gh_cli_opens_the_gate() {
        assert_eq!(credential_gate(true, false), Ok(()));
        assert_eq!(credential_gate(false, true), Ok(()));
    }

    #[test]
    fn push_refuses_a_branch_argument_and_names_the_rule() {
        let error = branch_override_refusal(Some("main")).expect_err("a branch override");

        assert!(error.contains("own mount branch"));
        assert_eq!(branch_override_refusal(None), Ok(()));
    }

    #[test]
    fn push_builds_a_plain_push_of_the_mount_branch() {
        assert_eq!(
            push_args("goodboy/feat-x", false),
            vec!["push", "origin", "goodboy/feat-x"]
        );
    }

    #[test]
    fn push_knows_only_the_lease_protected_force() {
        let args = push_args("goodboy/feat-x", true);

        assert_eq!(
            args,
            vec!["push", "--force-with-lease", "origin", "goodboy/feat-x"]
        );
        assert!(!args.contains(&"--force".to_string()));
    }

    #[test]
    fn the_thread_resolve_argv_carries_the_mutation_and_the_thread_id() {
        let args = thread_resolve_args("PRRT_abc");

        assert_eq!(args[0], "api");
        assert_eq!(args[1], "graphql");
        assert_eq!(args[2], "-f");
        assert!(args[3].starts_with("query=mutation($threadId:ID!)"));
        assert!(args[3].contains("resolveReviewThread(input:{threadId:$threadId})"));
        assert_eq!(args[4], "-F");
        assert_eq!(args[5], "threadId=PRRT_abc");
        assert_eq!(args.len(), 6);
    }

    #[test]
    fn the_thread_reply_argv_types_the_id_and_leaves_the_body_a_string() {
        let args = thread_reply_args("PRRT_abc", "done in abc123");

        assert!(args[3].contains("addPullRequestReviewThreadReply"));
        assert_eq!(args[4], "-F");
        assert_eq!(args[5], "threadId=PRRT_abc");
        assert_eq!(args[6], "-f");
        assert_eq!(args[7], "body=done in abc123");
    }

    #[test]
    fn the_review_threads_argv_addresses_the_repository_and_the_number() {
        let args = review_threads_args("acme", "app", 42);

        assert!(args[3].contains("reviewThreads(first:50)"));
        assert!(args[3].contains("isResolved"));
        assert_eq!(args[5], "owner=acme");
        assert_eq!(args[7], "name=app");
        assert_eq!(args[9], "pr=42");
    }

    #[test]
    fn a_merge_method_maps_to_exactly_one_gh_flag() {
        assert_eq!(merge_method_flag(None), Ok("--squash"));
        assert_eq!(merge_method_flag(Some("squash")), Ok("--squash"));
        assert_eq!(merge_method_flag(Some("merge")), Ok("--merge"));
        assert_eq!(merge_method_flag(Some("rebase")), Ok("--rebase"));
        assert!(merge_method_flag(Some("force"))
            .expect_err("unknown method")
            .contains("force"));
    }

    #[test]
    fn a_repository_slug_splits_into_owner_and_name_or_refuses() {
        assert_eq!(
            split_slug("acme/app"),
            Ok(("acme".to_string(), "app".to_string()))
        );
        assert!(split_slug("acme").is_err());
        assert!(split_slug("/app").is_err());
        assert!(split_slug("acme/").is_err());
    }

    #[test]
    fn a_selector_lands_between_the_verb_and_its_trailing_options() {
        assert_eq!(
            with_selector(strs(&["pr", "view"]), Some(7), &["--json", "number"]),
            vec!["pr", "view", "7", "--json", "number"]
        );
        assert_eq!(
            with_selector(strs(&["pr", "diff"]), None, &[]),
            vec!["pr", "diff"]
        );
    }

    #[test]
    fn a_failed_gh_call_reports_stderr_first_and_never_an_empty_message() {
        assert_eq!(failure(&gh_result("", "boom", 1)), "boom");
        assert_eq!(failure(&gh_result("partial", "", 1)), "partial");
        assert_eq!(failure(&gh_result("", "", 3)), "gh exited with 3");
    }

    #[test]
    fn failing_checks_still_come_back_as_data_not_as_an_error() {
        let payload = r#"[{"name":"ci","state":"FAILURE","bucket":"fail","link":"x"}]"#;

        let value = checks_out(gh_result(payload, "", 8)).expect("data");

        assert_eq!(value[0]["state"], "FAILURE");
        assert!(checks_out(gh_result("", "no checks", 1)).is_err());
    }

    #[test]
    fn a_graphql_error_message_beats_the_raw_payload() {
        let payload = r#"{"data":null,"errors":[{"message":"thread not found"}]}"#;

        let error = graphql_out(gh_result(payload, "", 1)).expect_err("a graphql error");

        assert_eq!(error, "thread not found");
    }

    #[test]
    fn the_review_threads_payload_flattens_to_threads_with_ids_and_state() {
        let payload: Value = serde_json::from_str(
            r#"{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[
                {"id":"PRRT_1","isResolved":false,"isOutdated":true,"path":"src/a.ts","line":3,
                 "comments":{"nodes":[
                    {"author":{"login":"octocat"},"body":"rename this","createdAt":"2026-08-01T00:00:00Z","url":"https://x"},
                    {"author":null,"body":"done","createdAt":"2026-08-02T00:00:00Z","url":"https://y"}
                 ]}}
            ]}}}}}"#,
        )
        .expect("a payload");

        let shaped = shape_threads(&payload);

        assert_eq!(shaped[0]["id"], "PRRT_1");
        assert_eq!(shaped[0]["isResolved"], false);
        assert_eq!(shaped[0]["comments"][0]["author"], "octocat");
        assert_eq!(shaped[0]["comments"][1]["author"], "unknown");
        assert_eq!(shaped[0]["comments"][1]["body"], "done");
    }

    #[test]
    fn an_empty_or_alien_payload_flattens_to_no_threads_at_all() {
        assert_eq!(shape_threads(&json!({})), json!([]));
        assert_eq!(shape_threads(&json!({"data":null})), json!([]));
    }
}
