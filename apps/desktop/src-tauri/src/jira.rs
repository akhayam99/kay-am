use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use thiserror::Error;

use crate::integration_credentials::{self, IntegrationCredentialError};
use crate::secrets;

const PROVIDER: &str = "jira";

pub struct JiraTokenCache(integration_credentials::SecretCache);

impl JiraTokenCache {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

#[derive(Debug, Error)]
pub enum JiraError {
    #[error("http error {status}: {body}")]
    Http { status: u16, body: String },
    #[error("authentication failed: {0}")]
    Auth(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid response shape: {0}")]
    InvalidShape(String),
    #[error("no personal API key stored for workspace {0}")]
    NoToken(String),
    #[error("credential store error: {0}")]
    Credential(#[from] IntegrationCredentialError),
    #[error("secret store error: {0}")]
    Secret(#[from] secrets::SecretError),
}

crate::util::impl_error_serialize!(JiraError);

impl JiraError {
    fn kind(&self) -> &'static str {
        match self {
            JiraError::Http { .. } => "http",
            JiraError::Auth(_) => "auth",
            JiraError::NotFound(_) => "not_found",
            JiraError::InvalidShape(_) => "shape",
            JiraError::NoToken(_) => "no_token",
            JiraError::Credential(_) => "credential",
            JiraError::Secret(_) => "secret",
        }
    }
}

impl From<reqwest::Error> for JiraError {
    fn from(e: reqwest::Error) -> Self {
        JiraError::Http {
            status: 0,
            body: e.to_string(),
        }
    }
}

const MAX_PAGES: u32 = 20;
const SEARCH_PAGE_SIZE: u32 = 50;
const COMMENT_PAGE_SIZE: i64 = 100;
const ISSUE_FIELDS: &str =
    "summary,description,status,issuetype,priority,assignee,reporter,labels,created,updated";

fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn site_root(site_url: &str) -> Result<String, JiraError> {
    let trimmed = site_url.trim().trim_end_matches('/');
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err(JiraError::InvalidShape(format!(
            "invalid site url: {}",
            site_url
        )));
    }
    Ok(trimmed.to_string())
}

fn api_base(site_url: &str) -> Result<String, JiraError> {
    Ok(format!("{}/rest/api/3", site_root(site_url)?))
}

fn browse_url(root: &str, issue_key: &str) -> String {
    format!("{}/browse/{}", root, issue_key)
}

fn issue_path(base: &str, issue_key: &str) -> String {
    format!("{}/issue/{}", base, percent_encode(issue_key))
}

fn search_url(base: &str, jql: &str, page_token: Option<&str>) -> String {
    let mut url = format!(
        "{}/search/jql?jql={}&fields={}&maxResults={}",
        base,
        percent_encode(jql),
        percent_encode(ISSUE_FIELDS),
        SEARCH_PAGE_SIZE
    );
    if let Some(token) = page_token {
        url.push_str(&format!("&nextPageToken={}", percent_encode(token)));
    }
    url
}

fn assignable_url(base: &str, issue_key: &str, query: Option<&str>) -> String {
    let mut url = format!(
        "{}/user/assignable/search?issueKey={}&maxResults=50",
        base,
        percent_encode(issue_key)
    );
    if let Some(term) = query.map(str::trim).filter(|term| !term.is_empty()) {
        url.push_str(&format!("&query={}", percent_encode(term)));
    }
    url
}

fn comments_url(base: &str, issue_key: &str, start_at: i64) -> String {
    format!(
        "{}/comment?startAt={}&maxResults={}&orderBy=created",
        issue_path(base, issue_key),
        start_at,
        COMMENT_PAGE_SIZE
    )
}

fn build_project_jql(project_key: &str, assigned_only: bool) -> String {
    let scope = match assigned_only {
        true => " AND assignee = currentUser()",
        false => "",
    };
    format!(
        "project = \"{}\"{} AND statusCategory != Done ORDER BY updated DESC",
        project_key.trim(),
        scope
    )
}

fn error_message(body: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    let messages: Vec<String> = parsed
        .get("errorMessages")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    if !messages.is_empty() {
        return Some(messages.join("; "));
    }
    let fields: Vec<String> = parsed
        .get("errors")
        .and_then(|value| value.as_object())
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| value.as_str().map(|text| format!("{key}: {text}")))
                .collect()
        })
        .unwrap_or_default();
    match fields.is_empty() {
        true => None,
        false => Some(fields.join("; ")),
    }
}

fn error_for_status(status: u16, body: String) -> JiraError {
    let detail = error_message(&body).unwrap_or_else(|| body.clone());
    match status {
        401 | 403 => JiraError::Auth(detail),
        404 => JiraError::NotFound(detail),
        _ => JiraError::Http { status, body },
    }
}

struct Credentials<'a> {
    root: &'a str,
    email: &'a str,
    token: &'a str,
}

async fn get_json<T: serde::de::DeserializeOwned>(
    credentials: &Credentials<'_>,
    url: &str,
) -> Result<T, JiraError> {
    let res = http_client()
        .get(url)
        .basic_auth(credentials.email, Some(credentials.token))
        .header("Accept", "application/json")
        .send()
        .await?;
    let status = res.status();
    let body = res.text().await?;
    if !status.is_success() {
        return Err(error_for_status(status.as_u16(), body));
    }
    serde_json::from_str(&body).map_err(|e| JiraError::InvalidShape(e.to_string()))
}

async fn send_json<T: serde::de::DeserializeOwned>(
    credentials: &Credentials<'_>,
    method: reqwest::Method,
    url: &str,
    body: &Value,
) -> Result<T, JiraError> {
    let res = http_client()
        .request(method, url)
        .basic_auth(credentials.email, Some(credentials.token))
        .header("Accept", "application/json")
        .json(body)
        .send()
        .await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(error_for_status(status.as_u16(), text));
    }
    serde_json::from_str(&text).map_err(|e| JiraError::InvalidShape(e.to_string()))
}

async fn send_no_content(
    credentials: &Credentials<'_>,
    method: reqwest::Method,
    url: &str,
    body: &Value,
) -> Result<(), JiraError> {
    let res = http_client()
        .request(method, url)
        .basic_auth(credentials.email, Some(credentials.token))
        .header("Accept", "application/json")
        .json(body)
        .send()
        .await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(error_for_status(status.as_u16(), text));
    }
    Ok(())
}

fn read_token(
    workspace_id: &str,
    project_id: Option<&str>,
    cache: &JiraTokenCache,
) -> Result<String, JiraError> {
    integration_credentials::read_for_binding(PROVIDER, workspace_id, project_id, &cache.0)?
        .ok_or_else(|| JiraError::NoToken(workspace_id.to_string()))
}

fn flatten_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(|value| value.as_str()) {
        return text.to_string();
    }
    let Some(items) = node.get("content").and_then(|value| value.as_array()) else {
        return String::new();
    };
    items.iter().map(flatten_text).collect::<Vec<_>>().join("")
}

fn link_href(marks: &[Value]) -> Option<String> {
    marks
        .iter()
        .find(|mark| mark.get("type").and_then(|value| value.as_str()) == Some("link"))
        .and_then(|mark| mark.get("attrs"))
        .and_then(|attrs| attrs.get("href"))
        .and_then(|href| href.as_str())
        .map(str::to_string)
}

fn apply_marks(node: &Value) -> String {
    let mut out = node
        .get("text")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let Some(marks) = node.get("marks").and_then(|value| value.as_array()) else {
        return out;
    };
    let has = |name: &str| {
        marks
            .iter()
            .any(|mark| mark.get("type").and_then(|value| value.as_str()) == Some(name))
    };
    if has("code") {
        out = format!("`{out}`");
    }
    if has("strong") {
        out = format!("**{out}**");
    }
    if has("em") {
        out = format!("*{out}*");
    }
    if has("strike") {
        out = format!("~~{out}~~");
    }
    if has("underline") {
        out = format!("_{out}_");
    }
    if let Some(href) = link_href(marks) {
        out = format!("[{out}]({href})");
    }
    out
}

fn render_inline_node(node: &Value) -> String {
    match node.get("type").and_then(|value| value.as_str()) {
        Some("text") => apply_marks(node),
        Some("hardBreak") => "\n".to_string(),
        Some("mention") => {
            let label = node
                .get("attrs")
                .and_then(|attrs| attrs.get("text"))
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim_start_matches('@');
            format!("@{label}")
        }
        Some("emoji") => node
            .get("attrs")
            .and_then(|attrs| attrs.get("text").or_else(|| attrs.get("shortName")))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string(),
        Some("inlineCard") => node
            .get("attrs")
            .and_then(|attrs| attrs.get("url"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string(),
        _ => flatten_text(node),
    }
}

fn render_inline(content: Option<&Value>) -> String {
    let Some(items) = content.and_then(|value| value.as_array()) else {
        return String::new();
    };
    items
        .iter()
        .map(render_inline_node)
        .collect::<Vec<_>>()
        .join("")
}

fn prefix_lines(text: &str, prefix: &str) -> String {
    text.lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn indent_continuation(text: &str, width: usize) -> String {
    let pad = " ".repeat(width);
    let mut lines = text.lines();
    let Some(first) = lines.next() else {
        return String::new();
    };
    let rest: Vec<String> = lines.map(|line| format!("{pad}{line}")).collect();
    match rest.is_empty() {
        true => first.to_string(),
        false => format!("{}\n{}", first, rest.join("\n")),
    }
}

fn render_list(node: &Value, ordered: bool) -> String {
    let Some(items) = node.get("content").and_then(|value| value.as_array()) else {
        return String::new();
    };
    items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let marker = match ordered {
                true => format!("{}. ", index + 1),
                false => "- ".to_string(),
            };
            let width = marker.len();
            indent_continuation(
                &format!("{marker}{}", render_blocks(item.get("content"))),
                width,
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_block(node: &Value) -> String {
    match node.get("type").and_then(|value| value.as_str()) {
        Some("paragraph") => render_inline(node.get("content")),
        Some("heading") => {
            let level = node
                .get("attrs")
                .and_then(|attrs| attrs.get("level"))
                .and_then(|value| value.as_u64())
                .unwrap_or(1)
                .clamp(1, 6) as usize;
            format!(
                "{} {}",
                "#".repeat(level),
                render_inline(node.get("content"))
            )
        }
        Some("bulletList") => render_list(node, false),
        Some("orderedList") => render_list(node, true),
        Some("listItem") => render_blocks(node.get("content")),
        Some("codeBlock") => {
            let language = node
                .get("attrs")
                .and_then(|attrs| attrs.get("language"))
                .and_then(|value| value.as_str())
                .unwrap_or("");
            format!("```{}\n{}\n```", language, flatten_text(node))
        }
        Some("blockquote") => prefix_lines(&render_blocks(node.get("content")), "> "),
        Some("rule") => "---".to_string(),
        _ => flatten_text(node),
    }
}

fn render_blocks(content: Option<&Value>) -> String {
    let Some(items) = content.and_then(|value| value.as_array()) else {
        return String::new();
    };
    items
        .iter()
        .map(render_block)
        .filter(|block| !block.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn adf_to_markdown(document: &Value) -> String {
    render_blocks(document.get("content"))
}

fn adf_field_to_markdown(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(text)) => text.clone(),
        Some(document) => adf_to_markdown(document),
    }
}

fn emphasised_line(line: &str) -> Option<&str> {
    let inner = line.strip_prefix('*')?.strip_suffix('*')?;
    if inner.is_empty() || inner.contains('*') {
        return None;
    }
    Some(inner)
}

fn paragraph_content(line: &str) -> Value {
    match emphasised_line(line) {
        Some(inner) => serde_json::json!([
            { "type": "text", "text": inner, "marks": [{ "type": "em" }] }
        ]),
        None => serde_json::json!([{ "type": "text", "text": line }]),
    }
}

fn text_to_adf(text: &str) -> Value {
    let paragraphs: Vec<Value> = text
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .map(|line| {
            serde_json::json!({
                "type": "paragraph",
                "content": paragraph_content(line)
            })
        })
        .collect();
    let content = match paragraphs.is_empty() {
        true => vec![serde_json::json!({ "type": "paragraph", "content": [] })],
        false => paragraphs,
    };
    serde_json::json!({ "type": "doc", "version": 1, "content": content })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraAvatarUrls {
    #[serde(rename = "48x48", default)]
    pub large: Option<String>,
    #[serde(rename = "24x24", default)]
    pub small: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraUser {
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "displayName", default)]
    pub display_name: String,
    #[serde(rename = "emailAddress", default)]
    pub email_address: Option<String>,
    #[serde(rename = "avatarUrls", default)]
    pub avatar_urls: Option<JiraAvatarUrls>,
    #[serde(default)]
    pub active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct JiraStatusCategory {
    #[serde(default)]
    key: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JiraStatus {
    #[serde(default)]
    name: Option<String>,
    #[serde(rename = "statusCategory", default)]
    status_category: Option<JiraStatusCategory>,
}

#[derive(Debug, Deserialize)]
struct JiraNamed {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct JiraIssueFields {
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    description: Option<Value>,
    #[serde(default)]
    status: Option<JiraStatus>,
    #[serde(default)]
    issuetype: Option<JiraNamed>,
    #[serde(default)]
    priority: Option<JiraNamed>,
    #[serde(default)]
    assignee: Option<JiraUser>,
    #[serde(default)]
    reporter: Option<JiraUser>,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    created: Option<String>,
    #[serde(default)]
    updated: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JiraIssueRaw {
    #[serde(default)]
    id: String,
    key: String,
    #[serde(default)]
    fields: Option<JiraIssueFields>,
}

#[derive(Debug, Serialize)]
pub struct JiraIssue {
    pub id: String,
    pub key: String,
    pub summary: String,
    pub description: String,
    pub status: String,
    #[serde(rename = "statusCategory")]
    pub status_category: String,
    #[serde(rename = "issueType")]
    pub issue_type: String,
    pub priority: Option<String>,
    pub assignee: Option<JiraUser>,
    pub reporter: Option<JiraUser>,
    pub labels: Vec<String>,
    pub created: String,
    pub updated: String,
    pub url: String,
}

fn map_issue(raw: JiraIssueRaw, root: &str) -> JiraIssue {
    let url = browse_url(root, &raw.key);
    let fields = raw.fields.unwrap_or_default();
    let status = fields.status;
    JiraIssue {
        id: raw.id,
        key: raw.key,
        summary: fields.summary.unwrap_or_default(),
        description: adf_field_to_markdown(fields.description.as_ref()),
        status: status
            .as_ref()
            .and_then(|value| value.name.clone())
            .unwrap_or_default(),
        status_category: status
            .as_ref()
            .and_then(|value| value.status_category.as_ref())
            .and_then(|category| category.key.clone())
            .unwrap_or_default(),
        issue_type: fields
            .issuetype
            .and_then(|value| value.name)
            .unwrap_or_default(),
        priority: fields.priority.and_then(|value| value.name),
        assignee: fields.assignee,
        reporter: fields.reporter,
        labels: fields.labels,
        created: fields.created.unwrap_or_default(),
        updated: fields.updated.unwrap_or_default(),
        url,
    }
}

#[derive(Debug, Deserialize)]
struct JiraSearchPage {
    #[serde(default)]
    issues: Vec<JiraIssueRaw>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
    #[serde(rename = "isLast", default)]
    is_last: Option<bool>,
}

struct SearchPager {
    seen_keys: HashSet<String>,
    seen_tokens: HashSet<String>,
    issues: Vec<JiraIssueRaw>,
}

impl SearchPager {
    fn new() -> Self {
        Self {
            seen_keys: HashSet::new(),
            seen_tokens: HashSet::new(),
            issues: Vec::new(),
        }
    }

    fn absorb(&mut self, page: JiraSearchPage) -> Result<Option<String>, JiraError> {
        for issue in page.issues {
            if self.seen_keys.insert(issue.key.clone()) {
                self.issues.push(issue);
            }
        }
        if page.is_last == Some(true) {
            return Ok(None);
        }
        let Some(token) = page.next_page_token.filter(|token| !token.is_empty()) else {
            return Ok(None);
        };
        if !self.seen_tokens.insert(token.clone()) {
            return Err(JiraError::InvalidShape(format!(
                "jira search pagination looped on token {token}"
            )));
        }
        Ok(Some(token))
    }
}

async fn search_issues(
    credentials: &Credentials<'_>,
    base: &str,
    jql: &str,
) -> Result<Vec<JiraIssueRaw>, JiraError> {
    let mut pager = SearchPager::new();
    let mut page_token: Option<String> = None;
    let mut pages: u32 = 0;
    loop {
        let url = search_url(base, jql, page_token.as_deref());
        let page: JiraSearchPage = get_json(credentials, &url).await?;
        page_token = pager.absorb(page)?;
        pages += 1;
        if page_token.is_none() || pages >= MAX_PAGES {
            break;
        }
    }
    Ok(pager.issues)
}

#[derive(Debug, Deserialize)]
struct JiraCommentRaw {
    #[serde(default)]
    id: String,
    #[serde(default)]
    author: Option<JiraUser>,
    #[serde(default)]
    body: Option<Value>,
    #[serde(default)]
    created: Option<String>,
    #[serde(default)]
    updated: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct JiraComment {
    pub id: String,
    pub author: Option<JiraUser>,
    pub body: String,
    pub created: String,
    pub updated: String,
}

fn map_comment(raw: JiraCommentRaw) -> JiraComment {
    JiraComment {
        id: raw.id,
        author: raw.author,
        body: adf_field_to_markdown(raw.body.as_ref()),
        created: raw.created.unwrap_or_default(),
        updated: raw.updated.unwrap_or_default(),
    }
}

#[derive(Debug, Deserialize)]
struct JiraCommentPage {
    #[serde(default)]
    comments: Vec<JiraCommentRaw>,
    #[serde(rename = "startAt", default)]
    start_at: i64,
    #[serde(default)]
    total: i64,
}

fn next_comment_offset(page: &JiraCommentPage) -> Option<i64> {
    let fetched = page.start_at + page.comments.len() as i64;
    if page.comments.is_empty() || fetched >= page.total {
        return None;
    }
    Some(fetched)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JiraTransitionTarget {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JiraTransition {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub to: Option<JiraTransitionTarget>,
    #[serde(rename = "hasScreen", default)]
    pub has_screen: bool,
}

#[derive(Debug, Deserialize)]
struct JiraTransitionsPayload {
    #[serde(default)]
    transitions: Vec<JiraTransition>,
}

struct JiraWrite {
    url: String,
    body: Value,
}

fn comment_write(base: &str, issue_key: &str, text: &str) -> JiraWrite {
    JiraWrite {
        url: format!("{}/comment", issue_path(base, issue_key)),
        body: serde_json::json!({ "body": text_to_adf(text) }),
    }
}

fn description_write(base: &str, issue_key: &str, description: &str) -> JiraWrite {
    JiraWrite {
        url: issue_path(base, issue_key),
        body: serde_json::json!({ "fields": { "description": text_to_adf(description) } }),
    }
}

fn assignee_write(base: &str, issue_key: &str, account_id: Option<&str>) -> JiraWrite {
    let target = match account_id.map(str::trim).filter(|id| !id.is_empty()) {
        Some(id) => Value::String(id.to_string()),
        None => Value::Null,
    };
    JiraWrite {
        url: format!("{}/assignee", issue_path(base, issue_key)),
        body: serde_json::json!({ "accountId": target }),
    }
}

fn transition_write(base: &str, issue_key: &str, transition_id: &str) -> JiraWrite {
    JiraWrite {
        url: format!("{}/transitions", issue_path(base, issue_key)),
        body: serde_json::json!({ "transition": { "id": transition_id } }),
    }
}

#[tauri::command]
pub async fn jira_validate_connection(
    credential_id: String,
    site_url: String,
    email: String,
    api_token: Option<String>,
    cache: State<'_, JiraTokenCache>,
) -> Result<JiraUser, JiraError> {
    let api_token =
        integration_credentials::secret_to_verify(PROVIDER, &credential_id, api_token, &cache.0)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &api_token,
    };
    get_json(&credentials, &format!("{base}/myself")).await
}

#[tauri::command]
pub async fn jira_connect(
    credential_id: String,
    api_token: Option<String>,
    cache: State<'_, JiraTokenCache>,
) -> Result<(), JiraError> {
    let api_token =
        integration_credentials::secret_to_verify(PROVIDER, &credential_id, api_token, &cache.0)?;
    integration_credentials::store_secret(&credential_id, &api_token, &cache.0)?;
    Ok(())
}

#[tauri::command]
pub async fn jira_list_issues(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    project_key: String,
    assigned_only: bool,
    cache: State<'_, JiraTokenCache>,
) -> Result<Vec<JiraIssue>, JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    let jql = build_project_jql(&project_key, assigned_only);
    let raw = search_issues(&credentials, &base, &jql).await?;
    Ok(raw
        .into_iter()
        .map(|issue| map_issue(issue, credentials.root))
        .collect())
}

#[tauri::command]
pub async fn jira_get_issue(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    issue_key: String,
    cache: State<'_, JiraTokenCache>,
) -> Result<JiraIssue, JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    let url = format!(
        "{}?fields={}",
        issue_path(&base, &issue_key),
        percent_encode(ISSUE_FIELDS)
    );
    let raw: JiraIssueRaw = get_json(&credentials, &url).await?;
    Ok(map_issue(raw, credentials.root))
}

#[tauri::command]
pub async fn jira_list_comments(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    issue_key: String,
    cache: State<'_, JiraTokenCache>,
) -> Result<Vec<JiraComment>, JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    let mut collected: Vec<JiraComment> = Vec::new();
    let mut start_at: i64 = 0;
    let mut pages: u32 = 0;
    loop {
        let page: JiraCommentPage =
            get_json(&credentials, &comments_url(&base, &issue_key, start_at)).await?;
        let next = next_comment_offset(&page);
        collected.extend(page.comments.into_iter().map(map_comment));
        pages += 1;
        match next {
            Some(offset) if pages < MAX_PAGES => start_at = offset,
            _ => break,
        }
    }
    Ok(collected)
}

#[tauri::command]
pub async fn jira_create_comment(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    issue_key: String,
    body: String,
    cache: State<'_, JiraTokenCache>,
) -> Result<JiraComment, JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    let write = comment_write(&base, &issue_key, &body);
    let raw: JiraCommentRaw =
        send_json(&credentials, reqwest::Method::POST, &write.url, &write.body).await?;
    Ok(map_comment(raw))
}

#[tauri::command]
pub async fn jira_update_issue(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    issue_key: String,
    description: String,
    cache: State<'_, JiraTokenCache>,
) -> Result<(), JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    let write = description_write(&base, &issue_key, &description);
    send_no_content(&credentials, reqwest::Method::PUT, &write.url, &write.body).await
}

#[tauri::command]
pub async fn jira_set_assignee(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    issue_key: String,
    account_id: Option<String>,
    cache: State<'_, JiraTokenCache>,
) -> Result<(), JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    let write = assignee_write(&base, &issue_key, account_id.as_deref());
    send_no_content(&credentials, reqwest::Method::PUT, &write.url, &write.body).await
}

#[tauri::command]
pub async fn jira_list_assignable_users(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    issue_key: String,
    query: Option<String>,
    cache: State<'_, JiraTokenCache>,
) -> Result<Vec<JiraUser>, JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    get_json(
        &credentials,
        &assignable_url(&base, &issue_key, query.as_deref()),
    )
    .await
}

#[tauri::command]
pub async fn jira_list_transitions(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    issue_key: String,
    cache: State<'_, JiraTokenCache>,
) -> Result<Vec<JiraTransition>, JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    let payload: JiraTransitionsPayload = get_json(
        &credentials,
        &format!("{}/transitions", issue_path(&base, &issue_key)),
    )
    .await?;
    Ok(payload.transitions)
}

#[tauri::command]
pub async fn jira_transition_issue(
    workspace_id: String,
    project_id: Option<String>,
    site_url: String,
    email: String,
    issue_key: String,
    transition_id: String,
    cache: State<'_, JiraTokenCache>,
) -> Result<(), JiraError> {
    let token = read_token(&workspace_id, project_id.as_deref(), &cache)?;
    let root = site_root(&site_url)?;
    let base = api_base(&site_url)?;
    let credentials = Credentials {
        root: &root,
        email: &email,
        token: &token,
    };
    let write = transition_write(&base, &issue_key, &transition_id);
    send_no_content(&credentials, reqwest::Method::POST, &write.url, &write.body).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(content: Value) -> Value {
        serde_json::json!({ "type": "doc", "version": 1, "content": content })
    }

    #[test]
    fn site_root_trims_trailing_slash_and_whitespace() {
        assert_eq!(
            site_root("  https://acme.atlassian.net/  ").unwrap(),
            "https://acme.atlassian.net"
        );
    }

    #[test]
    fn site_root_rejects_a_url_without_scheme() {
        let err = site_root("acme.atlassian.net").unwrap_err();
        assert!(matches!(err, JiraError::InvalidShape(_)));
    }

    #[test]
    fn api_base_appends_the_v3_rest_prefix() {
        assert_eq!(
            api_base("https://acme.atlassian.net").unwrap(),
            "https://acme.atlassian.net/rest/api/3"
        );
    }

    #[test]
    fn browse_url_points_at_the_issue_key() {
        assert_eq!(
            browse_url("https://acme.atlassian.net", "GB-12"),
            "https://acme.atlassian.net/browse/GB-12"
        );
    }

    #[test]
    fn error_kind_maps_each_variant() {
        assert_eq!(
            JiraError::Http {
                status: 500,
                body: "x".into()
            }
            .kind(),
            "http"
        );
        assert_eq!(JiraError::Auth("x".into()).kind(), "auth");
        assert_eq!(JiraError::NotFound("x".into()).kind(), "not_found");
        assert_eq!(JiraError::InvalidShape("x".into()).kind(), "shape");
        assert_eq!(JiraError::NoToken("ws".into()).kind(), "no_token");
    }

    #[test]
    fn error_for_status_treats_401_and_403_as_auth_failures() {
        let unauthorized = error_for_status(401, r#"{"errorMessages":["Bad token"]}"#.into());
        assert!(matches!(unauthorized, JiraError::Auth(ref m) if m == "Bad token"));
        let forbidden = error_for_status(403, r#"{"errorMessages":["No permission"]}"#.into());
        assert!(matches!(forbidden, JiraError::Auth(ref m) if m == "No permission"));
    }

    #[test]
    fn error_for_status_maps_404_to_not_found() {
        let err = error_for_status(
            404,
            r#"{"errorMessages":["Issue does not exist"],"errors":{}}"#.into(),
        );
        assert!(matches!(err, JiraError::NotFound(ref m) if m == "Issue does not exist"));
    }

    #[test]
    fn error_for_status_keeps_a_400_as_http_with_the_raw_body() {
        let body = r#"{"errorMessages":[],"errors":{"description":"Operation value must be an Atlassian Document"}}"#;
        let err = error_for_status(400, body.into());
        assert!(matches!(err, JiraError::Http { status: 400, .. }));
    }

    #[test]
    fn error_message_reads_the_field_errors_when_messages_are_empty() {
        let body = r#"{"errorMessages":[],"errors":{"body":"Comment body is not valid!"}}"#;
        assert_eq!(
            error_message(body),
            Some("body: Comment body is not valid!".to_string())
        );
    }

    #[test]
    fn error_message_is_none_for_a_non_json_body() {
        assert!(error_message("<html>gateway timeout</html>").is_none());
    }

    #[test]
    fn search_url_encodes_the_jql_and_pins_an_explicit_field_list() {
        let url = search_url(
            "https://acme.atlassian.net/rest/api/3",
            "project = \"GB\"",
            None,
        );
        assert!(url.starts_with("https://acme.atlassian.net/rest/api/3/search/jql?jql="));
        assert!(url.contains("project%20%3D%20%22GB%22"));
        assert!(url.contains("&fields=summary%2Cdescription"));
        assert!(url.contains("&maxResults=50"));
        assert!(!url.contains("nextPageToken"));
    }

    #[test]
    fn search_url_appends_the_opaque_page_token() {
        let url = search_url("https://x/rest/api/3", "project = \"GB\"", Some("tok/1="));
        assert!(url.ends_with("&nextPageToken=tok%2F1%3D"));
    }

    #[test]
    fn build_project_jql_scopes_to_the_project_and_skips_done() {
        assert_eq!(
            build_project_jql("GB", false),
            "project = \"GB\" AND statusCategory != Done ORDER BY updated DESC"
        );
    }

    #[test]
    fn build_project_jql_can_narrow_to_the_current_user() {
        assert_eq!(
            build_project_jql(" GB ", true),
            "project = \"GB\" AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
        );
    }

    #[test]
    fn issue_path_percent_encodes_the_key() {
        assert_eq!(
            issue_path("https://x/rest/api/3", "GB-12"),
            "https://x/rest/api/3/issue/GB-12"
        );
        assert!(issue_path("https://x/rest/api/3", "a b").ends_with("/issue/a%20b"));
    }

    #[test]
    fn assignable_url_requires_the_issue_key_and_adds_the_query_when_present() {
        let bare = assignable_url("https://x/rest/api/3", "GB-12", None);
        assert_eq!(
            bare,
            "https://x/rest/api/3/user/assignable/search?issueKey=GB-12&maxResults=50"
        );
        let filtered = assignable_url("https://x/rest/api/3", "GB-12", Some(" ami "));
        assert!(filtered.ends_with("&query=ami"));
        assert_eq!(
            assignable_url("https://x/rest/api/3", "GB-12", Some("  ")),
            bare
        );
    }

    #[test]
    fn comments_url_carries_the_start_at_offset() {
        assert_eq!(
            comments_url("https://x/rest/api/3", "GB-1", 100),
            "https://x/rest/api/3/issue/GB-1/comment?startAt=100&maxResults=100&orderBy=created"
        );
    }

    #[test]
    fn adf_reader_renders_a_paragraph_with_every_supported_mark() {
        let document = doc(serde_json::json!([{
            "type": "paragraph",
            "content": [
                { "type": "text", "text": "plain " },
                { "type": "text", "text": "bold", "marks": [{ "type": "strong" }] },
                { "type": "text", "text": " " },
                { "type": "text", "text": "italic", "marks": [{ "type": "em" }] },
                { "type": "text", "text": " " },
                { "type": "text", "text": "mono", "marks": [{ "type": "code" }] },
                { "type": "text", "text": " " },
                { "type": "text", "text": "gone", "marks": [{ "type": "strike" }] }
            ]
        }]));
        assert_eq!(
            adf_to_markdown(&document),
            "plain **bold** *italic* `mono` ~~gone~~"
        );
    }

    #[test]
    fn adf_reader_wraps_a_link_mark_around_the_other_marks() {
        let document = doc(serde_json::json!([{
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": "docs",
                "marks": [{ "type": "strong" }, { "type": "link", "attrs": { "href": "https://x.dev" } }]
            }]
        }]));
        assert_eq!(adf_to_markdown(&document), "[**docs**](https://x.dev)");
    }

    #[test]
    fn adf_reader_renders_headings_at_their_level() {
        let document = doc(serde_json::json!([
            { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Top" }] },
            { "type": "heading", "attrs": { "level": 3 }, "content": [{ "type": "text", "text": "Deep" }] }
        ]));
        assert_eq!(adf_to_markdown(&document), "# Top\n\n### Deep");
    }

    #[test]
    fn adf_reader_renders_bullet_and_ordered_lists() {
        let list = |kind: &str| {
            serde_json::json!({
                "type": kind,
                "content": [
                    { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "one" }] }] },
                    { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "two" }] }] }
                ]
            })
        };
        assert_eq!(
            adf_to_markdown(&doc(serde_json::json!([list("bulletList")]))),
            "- one\n- two"
        );
        assert_eq!(
            adf_to_markdown(&doc(serde_json::json!([list("orderedList")]))),
            "1. one\n2. two"
        );
    }

    #[test]
    fn adf_reader_fences_a_code_block_with_its_language() {
        let document = doc(serde_json::json!([{
            "type": "codeBlock",
            "attrs": { "language": "rust" },
            "content": [{ "type": "text", "text": "let x = 1;" }]
        }]));
        assert_eq!(adf_to_markdown(&document), "```rust\nlet x = 1;\n```");
    }

    #[test]
    fn adf_reader_turns_a_hard_break_into_a_newline_and_a_mention_into_a_handle() {
        let document = doc(serde_json::json!([{
            "type": "paragraph",
            "content": [
                { "type": "text", "text": "ping" },
                { "type": "hardBreak" },
                { "type": "mention", "attrs": { "id": "acc-1", "text": "@Amin", "userType": "APP" } }
            ]
        }]));
        assert_eq!(adf_to_markdown(&document), "ping\n@Amin");
    }

    #[test]
    fn adf_reader_flattens_an_unknown_node_instead_of_dropping_it() {
        let document = doc(serde_json::json!([{
            "type": "panel",
            "attrs": { "panelType": "warning" },
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "heads up" }] }]
        }]));
        assert_eq!(adf_to_markdown(&document), "heads up");
    }

    #[test]
    fn adf_reader_prefixes_a_blockquote_and_renders_a_rule() {
        let document = doc(serde_json::json!([
            { "type": "blockquote", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "quoted" }] }] },
            { "type": "rule" }
        ]));
        assert_eq!(adf_to_markdown(&document), "> quoted\n\n---");
    }

    #[test]
    fn adf_field_reads_a_null_description_as_empty_and_a_string_verbatim() {
        assert_eq!(adf_field_to_markdown(None), "");
        assert_eq!(adf_field_to_markdown(Some(&Value::Null)), "");
        assert_eq!(
            adf_field_to_markdown(Some(&Value::String("legacy".into()))),
            "legacy"
        );
    }

    #[test]
    fn adf_writer_emits_the_minimal_document_jira_accepts() {
        let document = text_to_adf("hello");
        assert_eq!(document["type"], "doc");
        assert_eq!(document["version"], 1);
        assert_eq!(document["content"][0]["type"], "paragraph");
        assert_eq!(document["content"][0]["content"][0]["type"], "text");
        assert_eq!(document["content"][0]["content"][0]["text"], "hello");
    }

    #[test]
    fn adf_writer_emits_one_paragraph_per_non_empty_line() {
        let document = text_to_adf("first\n\nsecond\n");
        let content = document["content"].as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["content"][0]["text"], "first");
        assert_eq!(content[1]["content"][0]["text"], "second");
    }

    #[test]
    fn adf_writer_falls_back_to_one_empty_paragraph_for_blank_input() {
        let document = text_to_adf("   \n\n");
        let content = document["content"].as_array().unwrap();
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["type"], "paragraph");
        assert!(content[0]["content"].as_array().unwrap().is_empty());
    }

    #[test]
    fn adf_round_trips_a_multi_paragraph_body() {
        let text = "first line\n\nsecond line";
        assert_eq!(adf_to_markdown(&text_to_adf(text)), text);
    }

    #[test]
    fn adf_writer_marks_a_fully_emphasised_line_as_em() {
        let document = text_to_adf("looks good\n\n*Written by Goodboy*");
        let content = document["content"].as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["content"][0]["text"], "looks good");
        assert!(content[0]["content"][0].get("marks").is_none());
        assert_eq!(content[1]["content"][0]["text"], "Written by Goodboy");
        assert_eq!(content[1]["content"][0]["marks"][0]["type"], "em");
    }

    #[test]
    fn adf_writer_keeps_asterisks_that_do_not_wrap_a_whole_line() {
        let document = text_to_adf("**Valid.** shipped\n\n*partial emphasis* here\n\n**bold**");
        let content = document["content"].as_array().unwrap();
        assert_eq!(content.len(), 3);
        assert_eq!(content[0]["content"][0]["text"], "**Valid.** shipped");
        assert_eq!(content[1]["content"][0]["text"], "*partial emphasis* here");
        assert_eq!(content[2]["content"][0]["text"], "**bold**");
        assert!(content[2]["content"][0].get("marks").is_none());
    }

    #[test]
    fn adf_round_trips_the_italic_attribution_line() {
        let text = "looks good\n\n*Written by Goodboy*";
        assert_eq!(adf_to_markdown(&text_to_adf(text)), text);
    }

    #[test]
    fn issue_parses_from_a_captured_shape_payload() {
        let raw = r#"{
            "id": "10002",
            "key": "GB-12",
            "fields": {
                "summary": "Ship the jira lens",
                "description": { "type": "doc", "version": 1, "content": [
                    { "type": "paragraph", "content": [{ "type": "text", "text": "Needs ADF" }] } ] },
                "status": { "name": "In Progress", "statusCategory": { "key": "indeterminate" } },
                "issuetype": { "name": "Task" },
                "priority": { "name": "High" },
                "assignee": { "accountId": "acc-1", "displayName": "Amin", "emailAddress": null,
                              "avatarUrls": { "48x48": "https://x/a.png" } },
                "reporter": { "accountId": "acc-2", "displayName": "Bot" },
                "labels": ["backend"],
                "created": "2026-07-01T10:00:00.000+0000",
                "updated": "2026-07-02T10:00:00.000+0000"
            }
        }"#;
        let issue = map_issue(
            serde_json::from_str(raw).unwrap(),
            "https://acme.atlassian.net",
        );
        assert_eq!(issue.key, "GB-12");
        assert_eq!(issue.description, "Needs ADF");
        assert_eq!(issue.status_category, "indeterminate");
        assert_eq!(issue.url, "https://acme.atlassian.net/browse/GB-12");
        assert_eq!(
            issue.assignee.unwrap().avatar_urls.unwrap().large.unwrap(),
            "https://x/a.png"
        );
    }

    #[test]
    fn issue_defaults_every_optional_field_on_a_bare_payload() {
        let raw = r#"{ "id": "1", "key": "GB-1" }"#;
        let issue = map_issue(serde_json::from_str(raw).unwrap(), "https://x");
        assert_eq!(issue.summary, "");
        assert_eq!(issue.description, "");
        assert_eq!(issue.status, "");
        assert!(issue.priority.is_none());
        assert!(issue.assignee.is_none());
        assert!(issue.labels.is_empty());
    }

    #[test]
    fn issue_serializes_to_camel_case_for_the_frontend() {
        let issue = map_issue(
            serde_json::from_str(r#"{ "id": "1", "key": "GB-1" }"#).unwrap(),
            "https://x",
        );
        let value = serde_json::to_value(&issue).unwrap();
        assert_eq!(value["statusCategory"], "");
        assert_eq!(value["issueType"], "");
        assert_eq!(value["key"], "GB-1");
    }

    #[test]
    fn search_pager_collects_pages_until_is_last() {
        let mut pager = SearchPager::new();
        let first: JiraSearchPage = serde_json::from_str(
            r#"{ "issues": [{ "id": "1", "key": "GB-1" }], "nextPageToken": "t1", "isLast": false }"#,
        )
        .unwrap();
        let second: JiraSearchPage =
            serde_json::from_str(r#"{ "issues": [{ "id": "2", "key": "GB-2" }], "isLast": true }"#)
                .unwrap();
        assert_eq!(pager.absorb(first).unwrap(), Some("t1".to_string()));
        assert_eq!(pager.absorb(second).unwrap(), None);
        assert_eq!(pager.issues.len(), 2);
    }

    #[test]
    fn search_pager_drops_issues_reserved_across_pages() {
        let mut pager = SearchPager::new();
        let first: JiraSearchPage = serde_json::from_str(
            r#"{ "issues": [{ "id": "1", "key": "GB-1" }], "nextPageToken": "t1" }"#,
        )
        .unwrap();
        let second: JiraSearchPage = serde_json::from_str(
            r#"{ "issues": [{ "id": "1", "key": "GB-1" }, { "id": "2", "key": "GB-2" }], "isLast": true }"#,
        )
        .unwrap();
        pager.absorb(first).unwrap();
        pager.absorb(second).unwrap();
        let keys: Vec<&str> = pager
            .issues
            .iter()
            .map(|issue| issue.key.as_str())
            .collect();
        assert_eq!(keys, vec!["GB-1", "GB-2"]);
    }

    #[test]
    fn search_pager_bails_when_the_page_token_repeats_with_no_progress() {
        let mut pager = SearchPager::new();
        let page = || -> JiraSearchPage {
            serde_json::from_str(
                r#"{ "issues": [{ "id": "1", "key": "GB-1" }], "nextPageToken": "t1", "isLast": false }"#,
            )
            .unwrap()
        };
        assert_eq!(pager.absorb(page()).unwrap(), Some("t1".to_string()));
        let err = pager.absorb(page()).unwrap_err();
        assert!(matches!(err, JiraError::InvalidShape(ref m) if m.contains("looped on token t1")));
    }

    #[test]
    fn search_pager_stops_on_a_missing_token_even_without_is_last() {
        let mut pager = SearchPager::new();
        let page: JiraSearchPage =
            serde_json::from_str(r#"{ "issues": [{ "id": "1", "key": "GB-1" }] }"#).unwrap();
        assert_eq!(pager.absorb(page).unwrap(), None);
    }

    #[test]
    fn comment_page_uses_start_at_and_total_not_a_cursor() {
        let raw = r#"{
            "startAt": 0, "maxResults": 100, "total": 3,
            "comments": [
                { "id": "1", "author": { "accountId": "acc-1", "displayName": "Amin" },
                  "body": { "type": "doc", "version": 1, "content": [
                    { "type": "paragraph", "content": [{ "type": "text", "text": "looks good" }] } ] },
                  "created": "2026-07-01T10:00:00.000+0000", "updated": "2026-07-01T10:00:00.000+0000" }
            ]
        }"#;
        let page: JiraCommentPage = serde_json::from_str(raw).unwrap();
        assert_eq!(next_comment_offset(&page), Some(1));
        let comment = map_comment(page.comments.into_iter().next().unwrap());
        assert_eq!(comment.body, "looks good");
        assert_eq!(comment.author.unwrap().display_name, "Amin");
    }

    #[test]
    fn next_comment_offset_stops_once_total_is_reached() {
        let page: JiraCommentPage =
            serde_json::from_str(r#"{ "startAt": 2, "total": 3, "comments": [{ "id": "3" }] }"#)
                .unwrap();
        assert_eq!(next_comment_offset(&page), None);
    }

    #[test]
    fn next_comment_offset_stops_on_an_empty_page() {
        let page: JiraCommentPage =
            serde_json::from_str(r#"{ "startAt": 0, "total": 9, "comments": [] }"#).unwrap();
        assert_eq!(next_comment_offset(&page), None);
    }

    #[test]
    fn transitions_parse_from_the_wrapped_payload() {
        let raw = r#"{ "transitions": [
            { "id": "31", "name": "Done", "hasScreen": false,
              "to": { "id": "10001", "name": "Done" } },
            { "id": "21", "name": "In Progress" }
        ] }"#;
        let payload: JiraTransitionsPayload = serde_json::from_str(raw).unwrap();
        assert_eq!(payload.transitions.len(), 2);
        assert_eq!(payload.transitions[0].to.as_ref().unwrap().name, "Done");
        assert!(payload.transitions[1].to.is_none());
    }

    #[test]
    fn assignable_users_parse_from_a_flat_array() {
        let raw = r#"[
            { "accountId": "acc-1", "displayName": "Amin", "active": true,
              "avatarUrls": { "24x24": "https://x/s.png", "48x48": "https://x/l.png" } },
            { "accountId": "acc-2", "displayName": "Bot" }
        ]"#;
        let users: Vec<JiraUser> = serde_json::from_str(raw).unwrap();
        assert_eq!(users.len(), 2);
        assert_eq!(users[0].active, Some(true));
        assert_eq!(
            users[0].avatar_urls.as_ref().unwrap().small.as_deref(),
            Some("https://x/s.png")
        );
        assert!(users[1].avatar_urls.is_none());
    }

    #[test]
    fn myself_parses_with_a_private_email_address() {
        let raw = r#"{ "accountId": "acc-1", "displayName": "Amin K", "emailAddress": null,
                       "active": true, "timeZone": "Europe/Rome" }"#;
        let user: JiraUser = serde_json::from_str(raw).unwrap();
        assert_eq!(user.account_id, "acc-1");
        assert_eq!(user.display_name, "Amin K");
        assert!(user.email_address.is_none());
    }

    #[test]
    fn assignee_write_sends_a_null_account_id_to_unassign() {
        let base = "https://x/rest/api/3";
        assert_eq!(
            assignee_write(base, "GB-1", None).url,
            "https://x/rest/api/3/issue/GB-1/assignee"
        );
        assert_eq!(
            assignee_write(base, "GB-1", None).body["accountId"],
            Value::Null
        );
        assert_eq!(
            assignee_write(base, "GB-1", Some("  ")).body["accountId"],
            Value::Null
        );
    }

    #[test]
    fn assignee_write_echoes_the_account_id_and_never_the_default_sentinel() {
        let write = assignee_write("https://x/rest/api/3", "GB-1", Some("acc-1"));
        assert_eq!(write.body["accountId"], "acc-1");
        assert_ne!(write.body["accountId"], "-1");
    }

    #[test]
    fn comment_write_targets_the_comment_collection_with_an_adf_body() {
        let write = comment_write("https://x/rest/api/3", "GB-1", "ship it");
        assert_eq!(write.url, "https://x/rest/api/3/issue/GB-1/comment");
        assert_eq!(write.body["body"]["type"], "doc");
        assert_eq!(write.body["body"]["version"], 1);
        assert_eq!(
            write.body["body"]["content"][0]["content"][0]["text"],
            "ship it"
        );
    }

    #[test]
    fn description_write_targets_the_issue_itself_and_nests_the_document_under_fields() {
        let write = description_write("https://x/rest/api/3", "GB-1", "new description");
        assert_eq!(write.url, "https://x/rest/api/3/issue/GB-1");
        assert_eq!(write.body["fields"]["description"]["type"], "doc");
        assert_eq!(
            write.body["fields"]["description"]["content"][0]["content"][0]["text"],
            "new description"
        );
    }

    #[test]
    fn transition_write_posts_the_chosen_transition_id_to_the_transitions_collection() {
        let write = transition_write("https://x/rest/api/3", "GB-1", "31");
        assert_eq!(write.url, "https://x/rest/api/3/issue/GB-1/transitions");
        assert_eq!(write.body["transition"]["id"], "31");
        assert_eq!(
            transition_write("https://x/rest/api/3", "GB-1", "41").body["transition"]["id"],
            "41"
        );
    }
}
