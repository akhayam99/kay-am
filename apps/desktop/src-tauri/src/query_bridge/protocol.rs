#![allow(dead_code)]

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const SOCKET_ENV: &str = "GOODBOY_QUERY_SOCKET";
pub const WORKSPACE_ENV: &str = "GOODBOY_WORKSPACE_ID";
pub const SESSION_ENV: &str = "GOODBOY_SESSION_ID";
pub const MOUNT_ENV: &str = "GOODBOY_MOUNT_ID";
pub const RUN_ENV: &str = "GOODBOY_RUN_ID";
pub const LEGACY_SOCKET_FILE: &str = "query.sock";
pub const SOCKET_PREFIX: &str = "query-";
pub const SOCKET_SUFFIX: &str = ".sock";
pub const BIN_ENV: &str = "GOODBOY_BIN";
pub const SUBCOMMAND: &str = "query";
pub const INVOCATION: &str = "\"$GOODBOY_BIN\" query";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QueryRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub mount: String,
    #[serde(default)]
    pub run_id: String,
    pub provider: String,
    pub verb: String,
    #[serde(default)]
    pub args: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub candidates: Option<serde_json::Value>,
}

pub const AMBIGUOUS_MOUNT: &str = "ambiguous_mount";
pub const MOUNT_UNAVAILABLE: &str = "mount_unavailable";
pub const BRANCH_MISMATCH: &str = "branch_mismatch";
pub const BRANCH_IN_USE: &str = "branch_in_use";
pub const UNSAFE_CLEANUP: &str = "unsafe_cleanup";
pub const OPERATION_PENDING: &str = "operation_pending";
pub const REQUEST_CONFLICT: &str = "request_conflict";

pub const ERROR_CODES: &[&str] = &[
    AMBIGUOUS_MOUNT,
    MOUNT_UNAVAILABLE,
    BRANCH_MISMATCH,
    BRANCH_IN_USE,
    UNSAFE_CLEANUP,
    OPERATION_PENDING,
    REQUEST_CONFLICT,
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BridgeError {
    pub message: String,
    pub code: Option<String>,
    pub candidates: Option<serde_json::Value>,
}

impl BridgeError {
    pub fn coded(code: &str, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            code: Some(code.to_string()),
            candidates: None,
        }
    }

    pub fn with_candidates(mut self, candidates: serde_json::Value) -> Self {
        self.candidates = Some(candidates);
        self
    }
}

impl From<String> for BridgeError {
    fn from(message: String) -> Self {
        Self {
            message,
            code: None,
            candidates: None,
        }
    }
}

impl From<&str> for BridgeError {
    fn from(message: &str) -> Self {
        Self::from(message.to_string())
    }
}

impl QueryResponse {
    pub fn ok(data: serde_json::Value) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
            code: None,
            candidates: None,
        }
    }

    pub fn failed(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(error.into()),
            code: None,
            candidates: None,
        }
    }

    pub fn refused(error: BridgeError) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(error.message),
            code: error.code,
            candidates: error.candidates,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Read,
    Write,
}

#[derive(Debug, Clone, Copy)]
pub struct VerbSpec {
    pub provider: &'static str,
    pub verb: &'static str,
    pub params: &'static [Param],
    pub access: Access,
    pub summary: &'static str,
}

#[derive(Debug, Clone, Copy)]
pub struct Param {
    pub name: &'static str,
    pub required: bool,
    pub kind: ParamKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParamKind {
    Text,
    Number,
    Flag,
}

const fn req(name: &'static str) -> Param {
    Param {
        name,
        required: true,
        kind: ParamKind::Text,
    }
}

const fn opt(name: &'static str) -> Param {
    Param {
        name,
        required: false,
        kind: ParamKind::Text,
    }
}

const fn num(name: &'static str) -> Param {
    Param {
        name,
        required: true,
        kind: ParamKind::Number,
    }
}

const fn opt_num(name: &'static str) -> Param {
    Param {
        name,
        required: false,
        kind: ParamKind::Number,
    }
}

const fn flag(name: &'static str) -> Param {
    Param {
        name,
        required: false,
        kind: ParamKind::Flag,
    }
}

pub const CATALOG: &[VerbSpec] = &[
    VerbSpec {
        provider: "project",
        verb: "materialize",
        params: &[req("name"), req("reason")],
        access: Access::Write,
        summary: "mount a workspace project into this session as a worktree and branch",
    },
    VerbSpec {
        provider: "mount",
        verb: "list",
        params: &[],
        access: Access::Read,
        summary: "every mount of this session with its branch, path and lifecycle state",
    },
    VerbSpec {
        provider: "mount",
        verb: "inspect",
        params: &[flag("size")],
        access: Access::Read,
        summary: "one mount with its head, its removal safety and, with --size, its disk usage",
    },
    VerbSpec {
        provider: "mount",
        verb: "fork",
        params: &[
            req("branch"),
            req("reason"),
            req("request-id"),
            opt("base"),
            flag("existing"),
        ],
        access: Access::Write,
        summary:
            "start a second line of work: a new mount and worktree, the source mount untouched",
    },
    VerbSpec {
        provider: "mount",
        verb: "switch",
        params: &[
            req("branch"),
            req("reason"),
            req("request-id"),
            flag("create"),
            flag("adopt-observed"),
        ],
        access: Access::Write,
        summary: "move this mount to another branch, keeping earlier pull requests as history",
    },
    VerbSpec {
        provider: "mount",
        verb: "attach",
        params: &[req("reason"), req("request-id")],
        access: Access::Write,
        summary: "give a detached mount a worktree again",
    },
    VerbSpec {
        provider: "mount",
        verb: "unmount",
        params: &[req("reason"), req("request-id"), flag("keep")],
        access: Access::Write,
        summary: "detach a mount, removing its directory unless --keep",
    },
    VerbSpec {
        provider: "mount",
        verb: "activate",
        params: &[req("request-id")],
        access: Access::Write,
        summary: "choose the mount the next turn works in",
    },
    VerbSpec {
        provider: "mount",
        verb: "resolve",
        params: &[req("intent"), req("reason"), req("request-id")],
        access: Access::Write,
        summary: "settle a branch mismatch by declaring switch or fork",
    },
    VerbSpec {
        provider: "mount",
        verb: "operation",
        params: &[req("request-id")],
        access: Access::Read,
        summary: "the recorded state of one mount request, for retries and timeouts",
    },
    VerbSpec {
        provider: "linear",
        verb: "issue",
        params: &[req("id")],
        access: Access::Read,
        summary: "one issue by identifier, for example ENG-123",
    },
    VerbSpec {
        provider: "linear",
        verb: "issues-assigned",
        params: &[opt("team")],
        access: Access::Read,
        summary: "open issues assigned to the connected user",
    },
    VerbSpec {
        provider: "linear",
        verb: "comments",
        params: &[req("id")],
        access: Access::Read,
        summary: "every comment on an issue, oldest first",
    },
    VerbSpec {
        provider: "linear",
        verb: "comment-create",
        params: &[req("id"), req("body")],
        access: Access::Write,
        summary: "post a comment on an issue",
    },
    VerbSpec {
        provider: "linear",
        verb: "issue-update",
        params: &[req("id"), req("description")],
        access: Access::Write,
        summary: "replace an issue description",
    },
    VerbSpec {
        provider: "sentry",
        verb: "issues",
        params: &[opt("query"), opt("cursor")],
        access: Access::Read,
        summary: "issues in the connected project",
    },
    VerbSpec {
        provider: "sentry",
        verb: "issue",
        params: &[req("id")],
        access: Access::Read,
        summary: "one issue by id",
    },
    VerbSpec {
        provider: "sentry",
        verb: "issue-detail",
        params: &[req("id")],
        access: Access::Read,
        summary: "one issue with stack frames, tags and breadcrumbs",
    },
    VerbSpec {
        provider: "github",
        verb: "prs",
        params: &[opt("state")],
        access: Access::Read,
        summary: "pull requests of the repository this session mounts",
    },
    VerbSpec {
        provider: "github",
        verb: "pr",
        params: &[opt_num("number")],
        access: Access::Read,
        summary: "one pull request, the current branch's when no number is given",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-for-branch",
        params: &[req("branch")],
        access: Access::Read,
        summary: "the pull request opened from a head branch",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-diff",
        params: &[opt_num("number")],
        access: Access::Read,
        summary: "unified diff of a pull request",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-checks",
        params: &[opt_num("number")],
        access: Access::Read,
        summary: "checks reported on a pull request",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-comments",
        params: &[opt_num("number")],
        access: Access::Read,
        summary: "review threads with their ids and resolved state",
    },
    VerbSpec {
        provider: "github",
        verb: "issues-assigned",
        params: &[],
        access: Access::Read,
        summary: "open issues assigned to the connected user",
    },
    VerbSpec {
        provider: "github",
        verb: "issue",
        params: &[num("number")],
        access: Access::Read,
        summary: "one issue by number",
    },
    VerbSpec {
        provider: "github",
        verb: "issue-comments",
        params: &[num("number")],
        access: Access::Read,
        summary: "every comment on an issue",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-comment-create",
        params: &[req("body"), opt_num("number")],
        access: Access::Write,
        summary: "post a comment on a pull request",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-thread-reply",
        params: &[req("thread"), req("body")],
        access: Access::Write,
        summary: "reply inside an existing review thread",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-thread-resolve",
        params: &[req("thread")],
        access: Access::Write,
        summary: "resolve a review thread",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-ready",
        params: &[opt_num("number")],
        access: Access::Write,
        summary: "mark a draft pull request ready for review",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-merge",
        params: &[opt_num("number"), opt("method")],
        access: Access::Write,
        summary: "merge a pull request with squash, merge or rebase",
    },
    VerbSpec {
        provider: "github",
        verb: "issue-comment-create",
        params: &[num("number"), req("body")],
        access: Access::Write,
        summary: "post a comment on an issue",
    },
    VerbSpec {
        provider: "github",
        verb: "push",
        params: &[opt("branch"), flag("force-with-lease")],
        access: Access::Write,
        summary: "push this session's mount branch to origin",
    },
    VerbSpec {
        provider: "github",
        verb: "pr-create",
        params: &[
            req("title"),
            req("body"),
            req("request-id"),
            opt("base"),
            opt("reference-mode"),
            flag("ready"),
        ],
        access: Access::Write,
        summary: "open a pull request from a mount branch, draft unless --ready",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "issues-assigned",
        params: &[],
        access: Access::Read,
        summary: "open issues assigned to the connected user",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "issue",
        params: &[req("project"), num("iid")],
        access: Access::Read,
        summary: "one issue by project path and iid",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "issue-notes",
        params: &[req("project"), num("iid")],
        access: Access::Read,
        summary: "notes on an issue",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "issue-update",
        params: &[req("project"), num("iid"), req("description")],
        access: Access::Write,
        summary: "replace an issue description",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "issue-note-create",
        params: &[req("project"), num("iid"), req("body")],
        access: Access::Write,
        summary: "post a note on an issue",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mrs-assigned",
        params: &[],
        access: Access::Read,
        summary: "merge requests assigned to the connected user",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mrs",
        params: &[req("project")],
        access: Access::Read,
        summary: "merge requests of one project",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-for-branch",
        params: &[req("project"), req("branch")],
        access: Access::Read,
        summary: "the merge request opened from a source branch",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-diff",
        params: &[req("project"), num("iid")],
        access: Access::Read,
        summary: "unified diff of a merge request",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-discussions",
        params: &[req("project"), num("iid")],
        access: Access::Read,
        summary: "review threads on a merge request",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-approval-state",
        params: &[req("project"), num("iid")],
        access: Access::Read,
        summary: "who approved a merge request and what is still required",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-note-create",
        params: &[req("project"), num("iid"), req("body")],
        access: Access::Write,
        summary: "post a plain note on a merge request",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-discussion-reply",
        params: &[req("project"), num("iid"), req("discussion"), req("body")],
        access: Access::Write,
        summary: "reply inside an existing review thread",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-discussion-resolve",
        params: &[
            req("project"),
            num("iid"),
            req("discussion"),
            flag("unresolve"),
        ],
        access: Access::Write,
        summary: "resolve a review thread, or reopen it with --unresolve",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-approve",
        params: &[req("project"), num("iid")],
        access: Access::Write,
        summary: "approve a merge request",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-unapprove",
        params: &[req("project"), num("iid")],
        access: Access::Write,
        summary: "withdraw an approval",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-merge",
        params: &[req("project"), num("iid")],
        access: Access::Write,
        summary: "merge a merge request",
    },
    VerbSpec {
        provider: "gitlab",
        verb: "mr-create",
        params: &[
            req("title"),
            req("body"),
            req("request-id"),
            opt("base"),
            opt("reference-mode"),
            flag("ready"),
        ],
        access: Access::Write,
        summary: "open a merge request from a mount branch, draft unless --ready",
    },
    VerbSpec {
        provider: "jira",
        verb: "issues",
        params: &[opt("project"), flag("all")],
        access: Access::Read,
        summary: "issues of a project, assigned to the connected user unless --all",
    },
    VerbSpec {
        provider: "jira",
        verb: "issue",
        params: &[req("key")],
        access: Access::Read,
        summary: "one issue by key, for example ENG-123",
    },
    VerbSpec {
        provider: "jira",
        verb: "comments",
        params: &[req("key")],
        access: Access::Read,
        summary: "every comment on an issue",
    },
    VerbSpec {
        provider: "jira",
        verb: "transitions",
        params: &[req("key")],
        access: Access::Read,
        summary: "transitions available on an issue",
    },
    VerbSpec {
        provider: "jira",
        verb: "comment-create",
        params: &[req("key"), req("body")],
        access: Access::Write,
        summary: "post a comment on an issue",
    },
    VerbSpec {
        provider: "jira",
        verb: "issue-update",
        params: &[req("key"), req("description")],
        access: Access::Write,
        summary: "replace an issue description",
    },
    VerbSpec {
        provider: "jira",
        verb: "transition",
        params: &[req("key"), req("transition")],
        access: Access::Write,
        summary: "move an issue through a transition id",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "prs",
        params: &[req("repo"), opt("state")],
        access: Access::Read,
        summary: "pull requests of a repository",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr",
        params: &[req("repo"), num("id")],
        access: Access::Read,
        summary: "one pull request by id",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-diff",
        params: &[req("repo"), num("id")],
        access: Access::Read,
        summary: "unified diff of a pull request",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-comments",
        params: &[req("repo"), num("id")],
        access: Access::Read,
        summary: "comments on a pull request",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-statuses",
        params: &[req("repo"), num("id")],
        access: Access::Read,
        summary: "build statuses reported on a pull request",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-for-branch",
        params: &[req("repo"), req("branch")],
        access: Access::Read,
        summary: "the pull request opened from a source branch",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-comment-create",
        params: &[req("repo"), num("id"), req("body")],
        access: Access::Write,
        summary: "post a comment on a pull request",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-comment-reply",
        params: &[req("repo"), num("id"), num("parent"), req("body")],
        access: Access::Write,
        summary: "reply to an existing pull request comment",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-approve",
        params: &[req("repo"), num("id")],
        access: Access::Write,
        summary: "approve a pull request",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-unapprove",
        params: &[req("repo"), num("id")],
        access: Access::Write,
        summary: "withdraw an approval",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-request-changes",
        params: &[req("repo"), num("id")],
        access: Access::Write,
        summary: "mark a pull request as needing changes",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-unrequest-changes",
        params: &[req("repo"), num("id")],
        access: Access::Write,
        summary: "withdraw a changes-requested mark",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-merge",
        params: &[req("repo"), num("id"), opt("message")],
        access: Access::Write,
        summary: "merge a pull request",
    },
    VerbSpec {
        provider: "bitbucket",
        verb: "pr-decline",
        params: &[req("repo"), num("id")],
        access: Access::Write,
        summary: "decline a pull request",
    },
    VerbSpec {
        provider: "slack",
        verb: "channels",
        params: &[],
        access: Access::Read,
        summary: "channels the connected bot can read",
    },
    VerbSpec {
        provider: "slack",
        verb: "thread-heads",
        params: &[req("channel")],
        access: Access::Read,
        summary: "root messages of a channel",
    },
    VerbSpec {
        provider: "slack",
        verb: "thread",
        params: &[req("channel"), req("ts")],
        access: Access::Read,
        summary: "every message in one thread",
    },
    VerbSpec {
        provider: "slack",
        verb: "permalink",
        params: &[req("channel"), req("ts")],
        access: Access::Read,
        summary: "the permalink of one message",
    },
    VerbSpec {
        provider: "slack",
        verb: "users",
        params: &[],
        access: Access::Read,
        summary: "members of the connected workspace",
    },
    VerbSpec {
        provider: "slack",
        verb: "reply",
        params: &[req("channel"), req("ts"), req("text")],
        access: Access::Write,
        summary: "post a reply in a thread",
    },
    VerbSpec {
        provider: "slack",
        verb: "reaction-add",
        params: &[req("channel"), req("ts"), req("name")],
        access: Access::Write,
        summary: "add an emoji reaction to a message",
    },
];

pub const UNIVERSAL_FLAGS: &[&str] = &["workspace", "project", "mount", "json"];

pub fn spec_for(provider: &str, verb: &str) -> Option<&'static VerbSpec> {
    CATALOG
        .iter()
        .find(|spec| spec.provider == provider && spec.verb == verb)
}

pub fn specs_for_provider(provider: &str) -> Vec<&'static VerbSpec> {
    CATALOG
        .iter()
        .filter(|spec| spec.provider == provider)
        .collect()
}

pub fn providers() -> Vec<&'static str> {
    let mut seen: Vec<&'static str> = Vec::new();
    for spec in CATALOG {
        if !seen.contains(&spec.provider) {
            seen.push(spec.provider);
        }
    }
    seen
}

pub fn requires_explicit_mount(provider: &str, verb: &str) -> bool {
    if provider == "mount" {
        return !matches!(verb, "list" | "operation");
    }
    matches!(
        (provider, verb),
        ("github", "pr-create") | ("gitlab", "mr-create")
    )
}

pub fn usage(spec: &VerbSpec) -> String {
    let mut line = format!("{} {} {}", INVOCATION, spec.provider, spec.verb);
    if requires_explicit_mount(spec.provider, spec.verb) {
        line.push_str(" --mount <id>");
    }
    for param in spec.params {
        let body = match param.kind {
            ParamKind::Flag => format!("--{}", param.name),
            _ => format!("--{} <{}>", param.name, param.name),
        };
        if param.required {
            line.push_str(&format!(" {}", body));
            continue;
        }
        line.push_str(&format!(" [{}]", body));
    }
    line
}

#[derive(Debug, PartialEq, Eq)]
pub struct ParsedArgv {
    pub provider: String,
    pub verb: String,
    pub args: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ArgvOutcome {
    Help,
    Parsed(ParsedArgv),
}

pub fn parse_argv(argv: &[String]) -> Result<ArgvOutcome, String> {
    let mut positional: Vec<&str> = Vec::new();
    let mut flags: Vec<(&str, Option<&str>)> = Vec::new();
    let mut index = 0;
    while index < argv.len() {
        let token = argv[index].as_str();
        if token == "--help" || token == "-h" {
            return Ok(ArgvOutcome::Help);
        }
        let Some(name) = token.strip_prefix("--") else {
            positional.push(token);
            index += 1;
            continue;
        };
        if let Some((name, value)) = name.split_once('=') {
            if is_valueless(name) {
                return Err(format!(
                    "--{} is a flag and takes no value: pass --{} to turn it on, or leave it out",
                    name, name
                ));
            }
            flags.push((name, Some(value)));
            index += 1;
            continue;
        }
        if is_valueless(name) {
            flags.push((name, None));
            index += 1;
            continue;
        }
        let next = argv.get(index + 1).map(String::as_str);
        match next {
            Some(value) if !value.starts_with("--") => {
                flags.push((name, Some(value)));
                index += 2;
            }
            _ => {
                flags.push((name, None));
                index += 1;
            }
        }
    }

    if positional.is_empty() {
        return Ok(ArgvOutcome::Help);
    }
    let provider = positional[0];
    let Some(verb) = positional.get(1) else {
        return Err(format!(
            "missing verb. try: {} {} --help",
            INVOCATION, provider
        ));
    };
    let Some(spec) = spec_for(provider, verb) else {
        return Err(format!(
            "unknown command: {} {}. try: {} --help",
            provider, verb, INVOCATION
        ));
    };

    let mut args: BTreeMap<String, serde_json::Value> = BTreeMap::new();
    let mut free = positional[2..].iter();
    for param in spec.params {
        let supplied = flags
            .iter()
            .find(|(name, _)| *name == param.name)
            .map(|(_, value)| *value);
        let value = match (supplied, param.kind) {
            (Some(_), ParamKind::Flag) => Some(serde_json::Value::Bool(true)),
            (Some(Some(raw)), _) => Some(text_or_number(raw, param.kind)?),
            (Some(None), _) => {
                return Err(format!("--{} needs a value", param.name));
            }
            (None, ParamKind::Flag) => None,
            (None, _) => match free.next() {
                Some(raw) => Some(text_or_number(raw, param.kind)?),
                None => None,
            },
        };
        match value {
            Some(value) => {
                args.insert(param.name.to_string(), value);
            }
            None if param.required => {
                return Err(format!("missing --{}\nusage: {}", param.name, usage(spec)));
            }
            None => {}
        }
    }

    for (name, _) in &flags {
        let known =
            spec.params.iter().any(|param| param.name == *name) || UNIVERSAL_FLAGS.contains(name);
        if !known {
            return Err(format!("unknown option --{}\nusage: {}", name, usage(spec)));
        }
    }

    Ok(ArgvOutcome::Parsed(ParsedArgv {
        provider: provider.to_string(),
        verb: (*verb).to_string(),
        args,
    }))
}

fn is_valueless(name: &str) -> bool {
    if name == "json" {
        return true;
    }
    CATALOG.iter().any(|spec| {
        spec.params
            .iter()
            .any(|param| param.name == name && param.kind == ParamKind::Flag)
    })
}

fn text_or_number(raw: &str, kind: ParamKind) -> Result<serde_json::Value, String> {
    if kind != ParamKind::Number {
        return Ok(serde_json::Value::String(raw.to_string()));
    }
    raw.parse::<i64>()
        .map(|value| serde_json::Value::Number(value.into()))
        .map_err(|_| format!("expected a number, got {}", raw))
}

pub fn help_text(provider: Option<&str>) -> String {
    let mut lines: Vec<String> = Vec::new();
    match provider {
        Some(provider) => {
            lines.push(format!("{} {} commands", INVOCATION, provider));
            for spec in specs_for_provider(provider) {
                lines.push(format!("  {}", usage(spec)));
                lines.push(format!("      {}", spec.summary));
            }
        }
        None => {
            lines.push(format!("usage: {} <provider> <verb> [options]", INVOCATION));
            lines.push(String::new());
            lines.push("providers:".to_string());
            for provider in providers() {
                let count = specs_for_provider(provider).len();
                lines.push(format!("  {} ({} commands)", provider, count));
            }
            lines.push(String::new());
            lines.push(format!(
                "run `{} <provider> --help` for that provider's commands",
                INVOCATION
            ));
            lines.push(format!(
                "the workspace comes from {}; override it with --workspace <id>",
                WORKSPACE_ENV
            ));
            lines.push(
                "scope a verb to one project of the workspace with --project <name>".to_string(),
            );
            lines.push(
                "name the mount a verb acts on with --mount <id>, from `mount list`".to_string(),
            );
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_verb_takes_its_arguments_positionally_in_declaration_order() {
        let argv = vec![
            "linear".to_string(),
            "issue".to_string(),
            "ENG-1".to_string(),
        ];

        let outcome = parse_argv(&argv).expect("parsed");

        assert_eq!(
            outcome,
            ArgvOutcome::Parsed(ParsedArgv {
                provider: "linear".to_string(),
                verb: "issue".to_string(),
                args: BTreeMap::from([("id".to_string(), serde_json::json!("ENG-1"))]),
            })
        );
    }

    #[test]
    fn a_named_option_wins_over_the_positional_slot_it_covers() {
        let argv = vec![
            "linear".to_string(),
            "comment-create".to_string(),
            "--id".to_string(),
            "ENG-2".to_string(),
            "--body".to_string(),
            "ship it".to_string(),
        ];

        let ArgvOutcome::Parsed(parsed) = parse_argv(&argv).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert_eq!(parsed.args["id"], serde_json::json!("ENG-2"));
        assert_eq!(parsed.args["body"], serde_json::json!("ship it"));
    }

    #[test]
    fn a_numeric_parameter_reaches_the_bridge_as_a_number() {
        let argv = vec![
            "gitlab".to_string(),
            "issue".to_string(),
            "group/app".to_string(),
            "42".to_string(),
        ];

        let ArgvOutcome::Parsed(parsed) = parse_argv(&argv).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert_eq!(parsed.args["project"], serde_json::json!("group/app"));
        assert_eq!(parsed.args["iid"], serde_json::json!(42));
    }

    #[test]
    fn a_numeric_parameter_refuses_a_word() {
        let argv = vec![
            "gitlab".to_string(),
            "issue".to_string(),
            "group/app".to_string(),
            "iid-42".to_string(),
        ];

        assert!(parse_argv(&argv).is_err());
    }

    #[test]
    fn a_flag_parameter_needs_no_value_and_stays_absent_when_unused() {
        let with = vec![
            "jira".to_string(),
            "issues".to_string(),
            "--all".to_string(),
        ];
        let without = vec!["jira".to_string(), "issues".to_string()];

        let ArgvOutcome::Parsed(with) = parse_argv(&with).expect("parsed") else {
            panic!("expected a parsed command");
        };
        let ArgvOutcome::Parsed(without) = parse_argv(&without).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert_eq!(with.args["all"], serde_json::json!(true));
        assert!(without.args.get("all").is_none());
    }

    #[test]
    fn a_flag_written_as_an_assignment_is_refused_in_both_polarities() {
        let off = vec![
            "jira".to_string(),
            "issues".to_string(),
            "--all=false".to_string(),
        ];
        let on = vec![
            "jira".to_string(),
            "issues".to_string(),
            "--all=true".to_string(),
        ];

        let off_error = parse_argv(&off).expect_err("--all=false is not a value");
        let on_error = parse_argv(&on).expect_err("--all=true is not a value");

        assert!(off_error.contains("--all is a flag and takes no value"));
        assert!(off_error.contains("pass --all"));
        assert_eq!(off_error, on_error);
    }

    #[test]
    fn only_the_bare_spelling_of_a_flag_turns_it_on() {
        let bare = vec![
            "jira".to_string(),
            "issues".to_string(),
            "--all".to_string(),
        ];

        let ArgvOutcome::Parsed(parsed) = parse_argv(&bare).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert_eq!(parsed.args["all"], serde_json::json!(true));
    }

    #[test]
    fn the_output_switch_is_refused_when_it_carries_a_value() {
        let argv = vec![
            "linear".to_string(),
            "issue".to_string(),
            "ENG-1".to_string(),
            "--json=false".to_string(),
        ];

        let error = parse_argv(&argv).expect_err("--json takes no value");

        assert!(error.contains("--json is a flag and takes no value"));
    }

    #[test]
    fn an_option_that_wants_a_value_still_accepts_the_inline_spelling() {
        let argv = vec![
            "linear".to_string(),
            "comment-create".to_string(),
            "--id=ENG-3".to_string(),
            "--body=ship it".to_string(),
        ];

        let ArgvOutcome::Parsed(parsed) = parse_argv(&argv).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert_eq!(parsed.args["id"], serde_json::json!("ENG-3"));
        assert_eq!(parsed.args["body"], serde_json::json!("ship it"));
    }

    #[test]
    fn a_missing_required_argument_reports_the_usage_line() {
        let argv = vec!["linear".to_string(), "issue".to_string()];

        let error = parse_argv(&argv).expect_err("missing id");

        assert!(error.contains("--id"));
        assert!(error.contains(&format!("{} linear issue", INVOCATION)));
    }

    #[test]
    fn an_unknown_verb_is_refused_before_the_socket_is_touched() {
        let argv = vec!["linear".to_string(), "delete-everything".to_string()];

        let error = parse_argv(&argv).expect_err("unknown verb");

        assert!(error.contains("unknown command"));
    }

    #[test]
    fn the_workspace_override_is_accepted_on_every_verb() {
        let argv = vec![
            "linear".to_string(),
            "issue".to_string(),
            "ENG-1".to_string(),
            "--workspace".to_string(),
            "ws-9".to_string(),
        ];

        let ArgvOutcome::Parsed(parsed) = parse_argv(&argv).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert!(parsed.args.get("workspace").is_none());
    }

    #[test]
    fn the_project_scope_override_is_accepted_on_a_verb_without_that_argument() {
        let argv = vec![
            "linear".to_string(),
            "issue".to_string(),
            "ENG-1".to_string(),
            "--project".to_string(),
            "app".to_string(),
        ];

        let ArgvOutcome::Parsed(parsed) = parse_argv(&argv).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert!(parsed.args.get("project").is_none());
    }

    #[test]
    fn an_unknown_option_is_refused() {
        let argv = vec![
            "linear".to_string(),
            "issue".to_string(),
            "ENG-1".to_string(),
            "--force".to_string(),
        ];

        assert!(parse_argv(&argv)
            .expect_err("unknown option")
            .contains("--force"));
    }

    #[test]
    fn no_argument_at_all_asks_for_help() {
        assert_eq!(parse_argv(&[]).expect("help"), ArgvOutcome::Help);
    }

    #[test]
    fn every_catalog_entry_has_a_unique_provider_and_verb_pair() {
        let mut seen: Vec<(&str, &str)> = Vec::new();
        for spec in CATALOG {
            let key = (spec.provider, spec.verb);
            assert!(!seen.contains(&key), "duplicate verb: {:?}", key);
            seen.push(key);
        }
    }

    #[test]
    fn every_catalog_entry_declares_required_parameters_before_optional_ones() {
        for spec in CATALOG {
            let first_optional = spec
                .params
                .iter()
                .position(|param| !param.required)
                .unwrap_or(spec.params.len());
            assert!(
                spec.params[first_optional..]
                    .iter()
                    .all(|param| !param.required),
                "{} {} mixes a required parameter after an optional one",
                spec.provider,
                spec.verb
            );
        }
    }

    #[test]
    fn the_catalog_covers_every_credential_backed_provider_and_the_session_verbs() {
        assert_eq!(
            providers(),
            vec![
                "project",
                "mount",
                "linear",
                "sentry",
                "github",
                "gitlab",
                "jira",
                "bitbucket",
                "slack"
            ]
        );
    }

    #[test]
    fn the_mount_override_is_accepted_on_every_verb_and_never_reaches_the_arguments() {
        let argv = vec![
            "github".to_string(),
            "pr".to_string(),
            "--mount".to_string(),
            "mount-9".to_string(),
        ];

        let ArgvOutcome::Parsed(parsed) = parse_argv(&argv).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert!(parsed.args.get("mount").is_none());
        assert!(UNIVERSAL_FLAGS.contains(&"mount"));
    }

    #[test]
    fn every_mount_verb_is_registered_under_the_access_its_effect_needs() {
        let read = ["list", "inspect", "operation"];
        let write = ["fork", "switch", "attach", "unmount", "activate", "resolve"];

        for verb in read {
            let spec = spec_for("mount", verb).unwrap_or_else(|| panic!("{} missing", verb));
            assert_eq!(spec.access, Access::Read, "{} must be read access", verb);
        }
        for verb in write {
            let spec = spec_for("mount", verb).unwrap_or_else(|| panic!("{} missing", verb));
            assert_eq!(spec.access, Access::Write, "{} must be write access", verb);
        }
        assert_eq!(specs_for_provider("mount").len(), read.len() + write.len());
    }

    #[test]
    fn a_mount_mutation_asks_for_a_reason_and_a_request_id() {
        for verb in ["fork", "switch", "attach", "unmount", "resolve"] {
            let spec = spec_for("mount", verb).expect("a spec");
            for name in ["reason", "request-id"] {
                assert!(
                    spec.params
                        .iter()
                        .any(|param| param.name == name && param.required),
                    "mount {} must require --{}",
                    verb,
                    name
                );
            }
        }
    }

    #[test]
    fn a_verb_that_acts_on_one_named_mount_says_so_in_its_usage_line() {
        let fork = usage(spec_for("mount", "fork").expect("a spec"));
        let list = usage(spec_for("mount", "list").expect("a spec"));

        assert!(fork.contains("mount fork --mount <id>"));
        assert!(!list.contains("--mount"));
        assert!(requires_explicit_mount("github", "pr-create"));
        assert!(!requires_explicit_mount("github", "pr"));
    }

    #[test]
    fn a_request_creating_a_review_request_takes_the_same_arguments_on_every_host() {
        let github = spec_for("github", "pr-create").expect("a spec");
        let gitlab = spec_for("gitlab", "mr-create").expect("a spec");

        let names =
            |spec: &VerbSpec| -> Vec<&str> { spec.params.iter().map(|param| param.name).collect() };
        assert_eq!(names(github), names(gitlab));
        assert_eq!(
            names(github),
            vec![
                "title",
                "body",
                "request-id",
                "base",
                "reference-mode",
                "ready"
            ]
        );
    }

    #[test]
    fn a_mount_verb_never_declares_the_universal_mount_flag_as_its_own_argument() {
        for spec in CATALOG {
            assert!(
                !spec.params.iter().any(|param| param.name == "mount"),
                "{} {} shadows the universal --mount flag",
                spec.provider,
                spec.verb
            );
        }
    }

    #[test]
    fn every_advertised_error_code_is_spelled_once() {
        let mut seen: Vec<&str> = Vec::new();
        for code in ERROR_CODES {
            assert!(!seen.contains(code), "duplicate error code: {}", code);
            seen.push(code);
        }
        assert!(ERROR_CODES.contains(&AMBIGUOUS_MOUNT));
        assert!(ERROR_CODES.contains(&REQUEST_CONFLICT));
    }

    #[test]
    fn every_github_verb_is_registered_under_the_access_its_effect_needs() {
        let read = [
            "prs",
            "pr",
            "pr-for-branch",
            "pr-diff",
            "pr-checks",
            "pr-comments",
            "issues-assigned",
            "issue",
            "issue-comments",
        ];
        let write = [
            "pr-comment-create",
            "pr-thread-reply",
            "pr-thread-resolve",
            "pr-ready",
            "pr-merge",
            "issue-comment-create",
            "push",
            "pr-create",
        ];

        for verb in read {
            let spec = spec_for("github", verb).unwrap_or_else(|| panic!("{} missing", verb));
            assert_eq!(spec.access, Access::Read, "{} must be read access", verb);
        }
        for verb in write {
            let spec = spec_for("github", verb).unwrap_or_else(|| panic!("{} missing", verb));
            assert_eq!(spec.access, Access::Write, "{} must be write access", verb);
        }
        assert_eq!(specs_for_provider("github").len(), read.len() + write.len());
    }

    #[test]
    fn the_github_push_verb_refuses_a_bare_force_flag() {
        let argv = vec![
            "github".to_string(),
            "push".to_string(),
            "--force".to_string(),
        ];

        assert!(parse_argv(&argv)
            .expect_err("--force is not a push option")
            .contains("--force"));
    }

    #[test]
    fn the_github_push_verb_accepts_only_the_lease_protected_force() {
        let argv = vec![
            "github".to_string(),
            "push".to_string(),
            "--force-with-lease".to_string(),
        ];

        let ArgvOutcome::Parsed(parsed) = parse_argv(&argv).expect("parsed") else {
            panic!("expected a parsed command");
        };

        assert_eq!(parsed.args["force-with-lease"], serde_json::json!(true));
        assert!(parsed.args.get("branch").is_none());
    }

    #[test]
    fn the_advertised_invocation_quotes_a_binary_path_that_may_hold_spaces() {
        assert_eq!(INVOCATION, format!("\"${}\" {}", BIN_ENV, SUBCOMMAND));
        assert!(help_text(Some("linear")).contains("\"$GOODBOY_BIN\" query linear issue"));
    }

    #[test]
    fn help_without_a_provider_lists_all_of_them() {
        let text = help_text(None);

        for provider in providers() {
            assert!(text.contains(provider), "{} missing from help", provider);
        }
    }
}
