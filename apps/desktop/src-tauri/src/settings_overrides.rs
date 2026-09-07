use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{Db, DbError};

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsOverrides {
    #[serde(rename = "defaultProviderId")]
    pub default_provider_id: Option<String>,
    #[serde(rename = "defaultWorkflowId")]
    pub default_workflow_id: Option<String>,
    #[serde(rename = "defaultBranchPrefix")]
    pub default_branch_prefix: Option<String>,
    #[serde(rename = "parallelEnabled")]
    pub parallel_enabled: Option<bool>,
    #[serde(rename = "defaultVerbosity")]
    pub default_verbosity: Option<String>,
    #[serde(rename = "providerBindings")]
    pub provider_bindings: Option<serde_json::Value>,
    #[serde(rename = "taskModels")]
    pub task_models: Option<serde_json::Value>,
    #[serde(rename = "roleModels")]
    pub role_models: Option<serde_json::Value>,
    #[serde(rename = "parallelAgents")]
    pub parallel_agents: Option<bool>,
    #[serde(rename = "enabledProviders")]
    pub enabled_providers: Option<Vec<String>>,
    #[serde(rename = "attributionFooter")]
    pub attribution_footer: Option<bool>,
}

fn json_to_text(value: &Option<serde_json::Value>) -> Option<String> {
    match value {
        Some(serde_json::Value::Null) | None => None,
        Some(v) => Some(v.to_string()),
    }
}

fn json_from_text(raw: Option<String>) -> Option<serde_json::Value> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
}

fn string_array_to_text(value: &Option<Vec<String>>) -> Option<String> {
    value
        .as_ref()
        .and_then(|items| serde_json::to_string(items).ok())
}

fn string_array_from_text(raw: Option<String>) -> Option<Vec<String>> {
    raw.and_then(|value| serde_json::from_str(&value).ok())
}

#[tauri::command]
pub async fn get_workspace_overrides(
    state: State<'_, Db>,
    workspace_id: String,
) -> Result<Option<SettingsOverrides>, DbError> {
    let conn = state.0.lock().map_err(|_| DbError::Poisoned)?;
    let mut stmt = conn.prepare(
        "SELECT default_provider_id, default_workflow_id, default_branch_prefix, parallel_enabled, default_verbosity, provider_bindings, task_models, role_models, parallel_agents, provider_pool, attribution_footer
         FROM workspaces WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(rusqlite::params![workspace_id], |row| {
        let parallel_raw: Option<i64> = row.get(3)?;
        let parallel_agents_raw: Option<i64> = row.get(8)?;
        let attribution_footer_raw: Option<i64> = row.get(10)?;
        Ok(SettingsOverrides {
            default_provider_id: row.get(0)?,
            default_workflow_id: row.get(1)?,
            default_branch_prefix: row.get(2)?,
            parallel_enabled: parallel_raw.map(|v| v != 0),
            default_verbosity: row.get(4)?,
            provider_bindings: json_from_text(row.get(5)?),
            task_models: json_from_text(row.get(6)?),
            role_models: json_from_text(row.get(7)?),
            parallel_agents: parallel_agents_raw.map(|v| v != 0),
            enabled_providers: string_array_from_text(row.get(9)?),
            attribution_footer: attribution_footer_raw.map(|v| v != 0),
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row.map_err(DbError::Sqlite)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn set_workspace_overrides(
    state: State<'_, Db>,
    workspace_id: String,
    overrides: SettingsOverrides,
) -> Result<(), DbError> {
    let conn = state.0.lock().map_err(|_| DbError::Poisoned)?;
    let parallel_val: Option<i64> = overrides.parallel_enabled.map(|v| if v { 1 } else { 0 });
    let parallel_agents_val: Option<i64> = overrides.parallel_agents.map(|v| if v { 1 } else { 0 });
    let attribution_footer_val: Option<i64> =
        overrides.attribution_footer.map(|v| if v { 1 } else { 0 });
    let now = crate::util::now_ms();
    conn.execute(
        "UPDATE workspaces
         SET default_provider_id = ?1,
             default_workflow_id = ?2,
             default_branch_prefix = ?3,
             parallel_enabled = ?4,
             default_verbosity = ?5,
             provider_bindings = ?6,
             task_models = ?7,
             role_models = ?8,
             parallel_agents = ?9,
             provider_pool = ?10,
             attribution_footer = ?11,
             updated_at = ?12
         WHERE id = ?13",
        rusqlite::params![
            overrides.default_provider_id,
            overrides.default_workflow_id,
            overrides.default_branch_prefix,
            parallel_val,
            overrides.default_verbosity,
            json_to_text(&overrides.provider_bindings),
            json_to_text(&overrides.task_models),
            json_to_text(&overrides.role_models),
            parallel_agents_val,
            string_array_to_text(&overrides.enabled_providers),
            attribution_footer_val,
            now,
            workspace_id,
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_session_overrides(
    state: State<'_, Db>,
    session_id: String,
) -> Result<Option<SettingsOverrides>, DbError> {
    let conn = state.0.lock().map_err(|_| DbError::Poisoned)?;
    let mut stmt = conn.prepare(
        "SELECT default_provider_id, default_workflow_id, default_branch_prefix, parallel_enabled, provider_bindings
         FROM sessions WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(rusqlite::params![session_id], |row| {
        let parallel_raw: Option<i64> = row.get(3)?;
        Ok(SettingsOverrides {
            default_provider_id: row.get(0)?,
            default_workflow_id: row.get(1)?,
            default_branch_prefix: row.get(2)?,
            parallel_enabled: parallel_raw.map(|v| v != 0),
            default_verbosity: None,
            provider_bindings: json_from_text(row.get(4)?),
            task_models: None,
            role_models: None,
            parallel_agents: None,
            enabled_providers: None,
            attribution_footer: None,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row.map_err(DbError::Sqlite)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn set_session_overrides(
    state: State<'_, Db>,
    session_id: String,
    overrides: SettingsOverrides,
) -> Result<(), DbError> {
    let conn = state.0.lock().map_err(|_| DbError::Poisoned)?;
    let parallel_val: Option<i64> = overrides.parallel_enabled.map(|v| if v { 1 } else { 0 });
    let now = crate::util::now_ms();
    conn.execute(
        "UPDATE sessions
         SET default_provider_id = ?1,
             default_workflow_id = ?2,
             default_branch_prefix = ?3,
             parallel_enabled = ?4,
             provider_bindings = ?5,
             updated_at = ?6
         WHERE id = ?7",
        rusqlite::params![
            overrides.default_provider_id,
            overrides.default_workflow_id,
            overrides.default_branch_prefix,
            parallel_val,
            json_to_text(&overrides.provider_bindings),
            now,
            session_id,
        ],
    )?;
    Ok(())
}
