use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use tauri::State;
use thiserror::Error;

use crate::db::Db;

/// Attachments live inside the worktree so the spawned provider CLI can read
/// them with a path relative to its cwd. `.goodboy/` is gitignored, so they
/// never pollute the diff.
const ATTACH_SUBDIR: &str = ".goodboy/attachments";

/// Hard ceiling on a single decoded attachment. Mirrors the composer-side
/// check — the second guard exists because `rel_path`/payloads also arrive
/// from persisted turn events, not just the live UI.
pub(crate) const MAX_BYTES: usize = 15 * 1024 * 1024;

#[derive(Debug, Error)]
pub enum AttachmentError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid base64 payload: {0}")]
    Decode(#[from] base64::DecodeError),
    #[error("attachment exceeds {0} byte limit")]
    TooLarge(usize),
    #[error("attachment path escapes the worktree attachment directory")]
    InvalidPath,
    #[error("unsupported attachment type: {0}")]
    UnsupportedMime(String),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("connection mutex poisoned")]
    Poisoned,
}

impl serde::Serialize for AttachmentError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Reduces an arbitrary file name to a flat, separator-free token. Drops any
/// directory component and replaces anything outside `[A-Za-z0-9._-]` — both a
/// path-traversal guard and a defense against shell-hostile names.
pub(crate) fn sanitize_segment(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    match cleaned.as_str() {
        "" | "." | ".." => "image".to_string(),
        _ => cleaned,
    }
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("pdf") => "application/pdf",
        Some("csv") => "text/csv",
        Some("tsv") => "text/tab-separated-values",
        Some("txt") | Some("log") => "text/plain",
        Some("md") | Some("markdown") => "text/markdown",
        Some("json") => "application/json",
        Some("xml") => "application/xml",
        Some("yaml") | Some("yml") => "application/yaml",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        _ => "application/octet-stream",
    }
}

/// Whitelist guard shared by the drag-drop path. Images plus a curated set of
/// document types the spawned agent can actually read (PDF/CSV/text) or parse
/// with its own tooling (office formats). Unknown binaries are rejected so a
/// stray drop never lands an unreadable blob in the worktree.
fn is_allowed_mime(mime: &str) -> bool {
    mime.starts_with("image/")
        || matches!(
            mime,
            "application/pdf"
                | "text/csv"
                | "text/tab-separated-values"
                | "text/plain"
                | "text/markdown"
                | "application/json"
                | "application/xml"
                | "application/yaml"
                | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
}

/// Writes a base64-encoded image into `<worktree>/.goodboy/attachments/` and
/// returns the worktree-relative path. The stored name is `<id>-<file_name>`,
/// both sanitized — `id` keeps names unique without a uuid crate.
#[tauri::command]
pub async fn attachment_write(
    worktree_dir: String,
    attachment_id: String,
    file_name: String,
    data_base64: String,
) -> Result<String, AttachmentError> {
    tauri::async_runtime::spawn_blocking(move || {
        attachment_write_blocking(worktree_dir, attachment_id, file_name, data_base64)
    })
    .await
    .map_err(|e| AttachmentError::Io(std::io::Error::other(e.to_string())))?
}

fn attachment_write_blocking(
    worktree_dir: String,
    attachment_id: String,
    file_name: String,
    data_base64: String,
) -> Result<String, AttachmentError> {
    let bytes = STANDARD.decode(data_base64.as_bytes())?;
    if bytes.len() > MAX_BYTES {
        return Err(AttachmentError::TooLarge(MAX_BYTES));
    }

    crate::session_dir::migrate_legacy_marker(Path::new(&worktree_dir))?;
    let dir = Path::new(&worktree_dir).join(ATTACH_SUBDIR);
    fs::create_dir_all(&dir)?;

    let stored = format!(
        "{}-{}",
        sanitize_segment(&attachment_id),
        sanitize_segment(&file_name)
    );
    fs::write(dir.join(&stored), &bytes)?;

    Ok(format!("{ATTACH_SUBDIR}/{stored}"))
}

/// Payload returned to the webview when the user drops a file onto the
/// composer. The frontend treats this as an `AttachmentInput` after camelCase
/// conversion, so it can flow through the same pipeline as a paste/pick.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedAttachment {
    file_name: String,
    mime_type: String,
    data_base64: String,
}

/// Reads a file the user dragged from the OS into the composer and returns the
/// bytes as base64 so the frontend can reuse the existing attachment pipeline.
/// Accepts the same whitelist as the composer picker, mirroring its `accept`
/// filter — the second guard exists because OS drag-drop bypasses the picker.
#[tauri::command]
pub async fn attachment_read_dropped(
    abs_path: String,
) -> Result<DroppedAttachment, AttachmentError> {
    tauri::async_runtime::spawn_blocking(move || attachment_read_dropped_blocking(abs_path))
        .await
        .map_err(|e| AttachmentError::Io(std::io::Error::other(e.to_string())))?
}

fn attachment_read_dropped_blocking(
    abs_path: String,
) -> Result<DroppedAttachment, AttachmentError> {
    let path = Path::new(&abs_path);
    let meta = fs::metadata(path)?;
    if !meta.is_file() {
        return Err(AttachmentError::InvalidPath);
    }
    if (meta.len() as usize) > MAX_BYTES {
        return Err(AttachmentError::TooLarge(MAX_BYTES));
    }

    let mime = mime_for(path);
    if !is_allowed_mime(mime) {
        return Err(AttachmentError::UnsupportedMime(mime.to_string()));
    }

    let bytes = fs::read(path)?;
    if bytes.len() > MAX_BYTES {
        return Err(AttachmentError::TooLarge(MAX_BYTES));
    }

    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();

    Ok(DroppedAttachment {
        file_name,
        mime_type: mime.to_string(),
        data_base64: STANDARD.encode(&bytes),
    })
}

/// Reads a previously written attachment back as a `data:` URL for display in
/// the webview. `rel_path` must be the worktree-relative path produced by
/// `attachment_write`; anything pointing outside the attachment dir is rejected.
#[tauri::command]
pub async fn attachment_read(
    worktree_dir: String,
    rel_path: String,
) -> Result<String, AttachmentError> {
    tauri::async_runtime::spawn_blocking(move || attachment_read_blocking(worktree_dir, rel_path))
        .await
        .map_err(|e| AttachmentError::Io(std::io::Error::other(e.to_string())))?
}

fn attachment_read_blocking(
    worktree_dir: String,
    rel_path: String,
) -> Result<String, AttachmentError> {
    if rel_path.contains("..") || !rel_path.starts_with(ATTACH_SUBDIR) {
        return Err(AttachmentError::InvalidPath);
    }

    let full = Path::new(&worktree_dir).join(&rel_path);
    let bytes = fs::read(&full)?;
    if bytes.len() > MAX_BYTES {
        return Err(AttachmentError::TooLarge(MAX_BYTES));
    }

    Ok(format!(
        "data:{};base64,{}",
        mime_for(&full),
        STANDARD.encode(&bytes)
    ))
}

#[tauri::command]
pub async fn attachment_delete(
    worktree_dir: String,
    rel_path: String,
) -> Result<(), AttachmentError> {
    tauri::async_runtime::spawn_blocking(move || attachment_delete_blocking(worktree_dir, rel_path))
        .await
        .map_err(|e| AttachmentError::Io(std::io::Error::other(e.to_string())))?
}

fn attachment_delete_blocking(
    worktree_dir: String,
    rel_path: String,
) -> Result<(), AttachmentError> {
    if rel_path.contains("..") || !rel_path.starts_with(ATTACH_SUBDIR) {
        return Err(AttachmentError::InvalidPath);
    }

    let full = Path::new(&worktree_dir).join(&rel_path);
    match fs::remove_file(&full) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AttachmentError::Io(e)),
    }
}

#[tauri::command(async)]
pub fn attachment_cleanup_orphans(state: State<'_, Db>) -> Result<u64, AttachmentError> {
    let worktree_references = {
        let conn = state.0.lock().map_err(|_| AttachmentError::Poisoned)?;
        let mut stmt = conn.prepare(
            "SELECT sw.worktree_path, ga.rel_path
             FROM session_worktrees sw
             JOIN sessions s ON s.id = sw.session_id
             LEFT JOIN goal_attachments ga
               ON ga.session_id = sw.session_id
               OR ga.workflow_run_id IN (
                 SELECT workflow_run_id
                 FROM session_workflows
                 WHERE session_id = sw.session_id
               )
             WHERE s.deleted_at IS NULL AND sw.worktree_path IS NOT NULL AND sw.is_attached = 1",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        let mut references = HashMap::<String, HashSet<String>>::new();
        for row in rows {
            let (worktree_path, rel_path) = row?;
            let paths = references.entry(worktree_path).or_default();
            if let Some(rel_path) = rel_path {
                paths.insert(rel_path);
            }
        }
        references
    };

    let mut removed = 0;
    for (worktree_path, referenced_paths) in worktree_references {
        removed += cleanup_orphans_for_worktree(Path::new(&worktree_path), &referenced_paths)?;
    }

    Ok(removed)
}

fn cleanup_orphans_for_worktree(
    worktree_path: &Path,
    referenced_paths: &HashSet<String>,
) -> Result<u64, AttachmentError> {
    let attachment_dir = worktree_path.join(ATTACH_SUBDIR);
    if !attachment_dir.is_dir() {
        return Ok(0);
    }
    let entries = match fs::read_dir(&attachment_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(AttachmentError::Io(error)),
    };
    let mut removed = 0;
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let rel_path = Path::new(ATTACH_SUBDIR)
            .join(entry.file_name())
            .to_string_lossy()
            .to_string();
        if referenced_paths.contains(&rel_path) {
            continue;
        }
        fs::remove_file(entry.path())?;
        removed += 1;
    }
    Ok(removed)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugReportImageInput {
    file_name: String,
    mime_type: String,
    data_base64: String,
}

fn bug_report_dir_name() -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("goodboy-report-{}-{}", std::process::id(), stamp)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedBugReportImage {
    file_name: String,
    mime_type: String,
    path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedBugReport {
    dir: String,
    images: Vec<StagedBugReportImage>,
}

/// Writes the images to a throwaway folder and reports where each one landed.
/// The upload reads them back from there, and the folder is what the file
/// manager opens when the reporter has to drag them in by hand instead.
fn write_bug_report_images(
    dir: &Path,
    images: &[BugReportImageInput],
) -> Result<Vec<StagedBugReportImage>, AttachmentError> {
    fs::create_dir_all(dir)?;
    let mut staged = Vec::with_capacity(images.len());
    for (index, image) in images.iter().enumerate() {
        let bytes = STANDARD.decode(image.data_base64.as_bytes())?;
        if bytes.len() > MAX_BYTES {
            return Err(AttachmentError::TooLarge(MAX_BYTES));
        }
        let stored = format!("{:02}-{}", index + 1, sanitize_segment(&image.file_name));
        let path = dir.join(stored);
        fs::write(&path, &bytes)?;
        staged.push(StagedBugReportImage {
            file_name: image.file_name.clone(),
            mime_type: image.mime_type.clone(),
            path: path.to_string_lossy().to_string(),
        });
    }
    Ok(staged)
}

#[tauri::command]
pub async fn bug_report_stage_images(
    images: Vec<BugReportImageInput>,
) -> Result<StagedBugReport, AttachmentError> {
    tauri::async_runtime::spawn_blocking(move || bug_report_stage_images_blocking(images))
        .await
        .map_err(|e| AttachmentError::Io(std::io::Error::other(e.to_string())))?
}

fn bug_report_stage_images_blocking(
    images: Vec<BugReportImageInput>,
) -> Result<StagedBugReport, AttachmentError> {
    let dir = std::env::temp_dir().join(bug_report_dir_name());
    let staged = write_bug_report_images(&dir, &images)?;
    Ok(StagedBugReport {
        dir: dir.to_string_lossy().to_string(),
        images: staged,
    })
}

/// Resolves a caller-supplied path back to a report staging folder. Anything
/// outside the temp directory and anything not named like a report folder is
/// refused before it can be opened or deleted.
fn resolve_bug_report_dir(dir: &str) -> Result<std::path::PathBuf, AttachmentError> {
    let canonical_dir = Path::new(dir).canonicalize()?;
    let canonical_temp_dir = std::env::temp_dir().canonicalize()?;
    let is_report_dir = canonical_dir
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("goodboy-report-"));
    if !canonical_dir.starts_with(canonical_temp_dir) || !is_report_dir {
        return Err(AttachmentError::InvalidPath);
    }
    Ok(canonical_dir)
}

#[tauri::command]
pub async fn bug_report_reveal_images(dir: String) -> Result<(), AttachmentError> {
    tauri::async_runtime::spawn_blocking(move || bug_report_reveal_images_blocking(dir))
        .await
        .map_err(|e| AttachmentError::Io(std::io::Error::other(e.to_string())))?
}

fn bug_report_reveal_images_blocking(dir: String) -> Result<(), AttachmentError> {
    let canonical_dir = resolve_bug_report_dir(&dir)?;
    crate::explore::spawn_open(&canonical_dir, false)?;
    Ok(())
}

#[tauri::command]
pub async fn bug_report_discard_images(dir: String) -> Result<(), AttachmentError> {
    tauri::async_runtime::spawn_blocking(move || bug_report_discard_images_blocking(dir))
        .await
        .map_err(|e| AttachmentError::Io(std::io::Error::other(e.to_string())))?
}

fn bug_report_discard_images_blocking(dir: String) -> Result<(), AttachmentError> {
    let canonical_dir = resolve_bug_report_dir(&dir)?;
    match fs::remove_dir_all(&canonical_dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AttachmentError::Io(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_path_separators() {
        assert_eq!(sanitize_segment("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_segment("a/b/c.png"), "c.png");
        assert_eq!(sanitize_segment(".."), "image");
        assert_eq!(sanitize_segment(""), "image");
        assert_eq!(sanitize_segment("my shot!.PNG"), "my_shot_.PNG");
    }

    #[test]
    fn cleanup_tolerates_a_legacy_marker_file_at_the_goodboy_path() {
        let dir = std::env::temp_dir().join(format!(
            "goodboy-attach-marker-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(".goodboy"), b"{}").unwrap();
        let removed = cleanup_orphans_for_worktree(&dir, &HashSet::new()).unwrap();
        assert_eq!(removed, 0);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_migrates_a_legacy_marker_file_before_storing() {
        let dir = std::env::temp_dir().join(format!(
            "goodboy-attach-migrate-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(".goodboy"), b"{\"sessionId\":\"s\"}").unwrap();
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        let rel = attachment_write_blocking(
            dir.to_string_lossy().to_string(),
            "att-1".to_string(),
            "shot.png".to_string(),
            png_b64.to_string(),
        )
        .unwrap();
        assert_eq!(rel, ".goodboy/attachments/att-1-shot.png");
        assert!(dir.join(".goodboy").is_dir());
        assert_eq!(
            fs::read(dir.join(".goodboy").join("session.json")).unwrap(),
            b"{\"sessionId\":\"s\"}"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_then_read_roundtrips() {
        let dir = std::env::temp_dir().join(format!("goodboy-attach-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // 1x1 transparent PNG.
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        let rel = attachment_write_blocking(
            dir.to_string_lossy().to_string(),
            "att-1".to_string(),
            "shot.png".to_string(),
            png_b64.to_string(),
        )
        .unwrap();
        assert_eq!(rel, ".goodboy/attachments/att-1-shot.png");

        let data_url = attachment_read_blocking(dir.to_string_lossy().to_string(), rel).unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_removes_file_and_rejects_traversal() {
        let dir = std::env::temp_dir().join(format!("goodboy-attach-del-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        let rel = attachment_write_blocking(
            dir.to_string_lossy().to_string(),
            "att-del".to_string(),
            "shot.png".to_string(),
            png_b64.to_string(),
        )
        .unwrap();
        let full = Path::new(&dir).join(&rel);
        assert!(full.exists());

        attachment_delete_blocking(dir.to_string_lossy().to_string(), rel.clone()).unwrap();
        assert!(!full.exists());

        attachment_delete_blocking(dir.to_string_lossy().to_string(), rel).unwrap();

        let err = attachment_delete_blocking("/tmp".to_string(), "../../etc/passwd".to_string());
        assert!(matches!(err, Err(AttachmentError::InvalidPath)));
        let err = attachment_delete_blocking("/tmp".to_string(), "etc/passwd".to_string());
        assert!(matches!(err, Err(AttachmentError::InvalidPath)));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn cleanup_removes_only_unreferenced_attachment_files() {
        let dir =
            std::env::temp_dir().join(format!("goodboy-attach-cleanup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let attachment_dir = dir.join(ATTACH_SUBDIR);
        fs::create_dir_all(&attachment_dir).unwrap();
        fs::write(attachment_dir.join("keep.png"), b"keep").unwrap();
        fs::write(attachment_dir.join("orphan.png"), b"orphan").unwrap();
        let referenced = HashSet::from([format!("{ATTACH_SUBDIR}/keep.png")]);

        let removed = cleanup_orphans_for_worktree(&dir, &referenced).unwrap();

        assert_eq!(removed, 1);
        assert!(attachment_dir.join("keep.png").is_file());
        assert!(!attachment_dir.join("orphan.png").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_rejects_traversal() {
        let err = attachment_read_blocking("/tmp".to_string(), "../../etc/passwd".to_string());
        assert!(matches!(err, Err(AttachmentError::InvalidPath)));
        let err = attachment_read_blocking("/tmp".to_string(), "etc/passwd".to_string());
        assert!(matches!(err, Err(AttachmentError::InvalidPath)));
    }

    #[test]
    fn read_dropped_rejects_unsupported_type() {
        let dir = std::env::temp_dir().join(format!("goodboy-drop-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let blob = dir.join("payload.bin");
        fs::write(&blob, b"\x00\x01\x02").unwrap();
        let err = attachment_read_dropped_blocking(blob.to_string_lossy().to_string());
        assert!(matches!(err, Err(AttachmentError::UnsupportedMime(_))));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_dropped_accepts_documents() {
        let dir = std::env::temp_dir().join(format!("goodboy-drop-doc-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let csv = dir.join("data.csv");
        fs::write(&csv, b"a,b\n1,2\n").unwrap();
        let out = attachment_read_dropped_blocking(csv.to_string_lossy().to_string()).unwrap();
        assert_eq!(out.file_name, "data.csv");
        assert_eq!(out.mime_type, "text/csv");

        let pdf = dir.join("doc.pdf");
        fs::write(&pdf, b"%PDF-1.4\n").unwrap();
        let out = attachment_read_dropped_blocking(pdf.to_string_lossy().to_string()).unwrap();
        assert_eq!(out.mime_type, "application/pdf");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bug_report_images_land_on_disk_numbered_and_sanitized() {
        let dir = std::env::temp_dir().join(format!("goodboy-report-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);

        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        let staged = write_bug_report_images(
            &dir,
            &[
                BugReportImageInput {
                    file_name: "../../board freeze.png".to_string(),
                    mime_type: "image/png".to_string(),
                    data_base64: png_b64.to_string(),
                },
                BugReportImageInput {
                    file_name: "second.png".to_string(),
                    mime_type: "image/png".to_string(),
                    data_base64: png_b64.to_string(),
                },
            ],
        )
        .unwrap();

        assert!(dir.join("01-board_freeze.png").is_file());
        assert!(dir.join("02-second.png").is_file());
        assert_eq!(staged.len(), 2);
        assert_eq!(staged[0].file_name, "../../board freeze.png");
        assert_eq!(staged[0].mime_type, "image/png");
        assert_eq!(
            staged[0].path,
            dir.join("01-board_freeze.png").to_string_lossy()
        );
        assert_eq!(
            fs::read(dir.join("02-second.png")).unwrap(),
            STANDARD.decode(png_b64).unwrap()
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bug_report_images_reject_a_bad_payload() {
        let dir = std::env::temp_dir().join(format!("goodboy-report-bad-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);

        let err = write_bug_report_images(
            &dir,
            &[BugReportImageInput {
                file_name: "shot.png".to_string(),
                mime_type: "image/png".to_string(),
                data_base64: "not base64!!".to_string(),
            }],
        );
        assert!(matches!(err, Err(AttachmentError::Decode(_))));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bug_report_discard_removes_a_staged_folder_and_refuses_anything_else() {
        let dir = std::env::temp_dir().join(format!("goodboy-report-drop-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("01-shot.png"), b"bytes").unwrap();

        bug_report_discard_images_blocking(dir.to_string_lossy().to_string()).unwrap();
        assert!(!dir.exists());

        let other = std::env::temp_dir().join(format!("goodboy-keep-{}", std::process::id()));
        let _ = fs::remove_dir_all(&other);
        fs::create_dir_all(&other).unwrap();
        let err = bug_report_discard_images_blocking(other.to_string_lossy().to_string());
        assert!(matches!(err, Err(AttachmentError::InvalidPath)));
        assert!(other.exists());

        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn bug_report_reveal_rejects_an_unrelated_temp_folder() {
        let dir = std::env::temp_dir().join(format!("goodboy-other-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let result = bug_report_reveal_images_blocking(dir.to_string_lossy().to_string());

        assert!(matches!(result, Err(AttachmentError::InvalidPath)));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_dropped_returns_image_bytes() {
        let dir = std::env::temp_dir().join(format!("goodboy-drop-img-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let png = dir.join("shot.png");
        // 1x1 transparent PNG.
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        fs::write(&png, STANDARD.decode(png_b64).unwrap()).unwrap();
        let out = attachment_read_dropped_blocking(png.to_string_lossy().to_string()).unwrap();
        assert_eq!(out.file_name, "shot.png");
        assert_eq!(out.mime_type, "image/png");
        assert_eq!(out.data_base64, png_b64);
        let _ = fs::remove_dir_all(&dir);
    }
}
