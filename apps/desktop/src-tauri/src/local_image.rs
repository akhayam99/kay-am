use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path};

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use rusqlite::Connection;
use tauri::State;

use crate::db::Db;

const MAX_IMAGE_BYTES: u64 = 15 * 1024 * 1024;

#[tauri::command]
pub async fn local_image_read(
    state: State<'_, Db>,
    session_id: String,
    path: String,
) -> Result<String, String> {
    let root = {
        let conn = state.0.lock().map_err(|_| "image root is unavailable")?;
        resolve_root(&conn, &session_id)?
    };
    tauri::async_runtime::spawn_blocking(move || read_image(Path::new(&root), Path::new(&path)))
        .await
        .map_err(|_| "could not read the image".to_string())?
}

fn resolve_root(conn: &Connection, session_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT COALESCE(
            (SELECT sw.worktree_path FROM session_worktrees sw
             WHERE sw.session_id = s.id AND sw.project_id = s.active_project_id
             ORDER BY sw.parallel_index, sw.created_at, sw.id LIMIT 1),
            (SELECT sw.worktree_path FROM session_worktrees sw
             WHERE sw.session_id = s.id
             ORDER BY sw.parallel_index, sw.created_at, sw.id LIMIT 1),
            (SELECT p.root_path FROM projects p
             WHERE p.id = s.active_project_id AND p.workspace_id = s.workspace_id)
         ) FROM sessions s WHERE s.id = ?1",
        [session_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .map_err(|_| "image root is unavailable".to_string())?
    .filter(|root| !root.is_empty())
    .ok_or_else(|| "image root is unavailable".to_string())
}

fn read_image(root: &Path, path: &Path) -> Result<String, String> {
    if !root.is_absolute()
        || path.components().any(|part| part == Component::ParentDir)
        || root.components().any(|part| part == Component::ParentDir)
    {
        return Err("image path escapes the selected root".to_string());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let expected_mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Err("unsupported image type".to_string()),
    };
    let canonical_root = fs::canonicalize(root).map_err(|_| "image root is unavailable")?;
    let canonical_path = fs::canonicalize(root.join(path)).map_err(|_| "image is unavailable")?;
    let relative = canonical_path
        .strip_prefix(&canonical_root)
        .map_err(|_| "image path escapes the selected root")?;
    let file = open_scoped(&canonical_root, relative).map_err(|_| "image is unavailable")?;
    let metadata = file.metadata().map_err(|_| "image is unavailable")?;
    if !metadata.is_file() {
        return Err("image must be a regular file".to_string());
    }
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("image exceeds the 15 MiB limit".to_string());
    }
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "could not read the image")?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("image exceeds the 15 MiB limit".to_string());
    }
    if crate::remote_image::sniff_image_mime(&bytes) != Some(expected_mime) {
        return Err("image content does not match its file type".to_string());
    }
    Ok(format!(
        "data:{expected_mime};base64,{}",
        STANDARD.encode(bytes)
    ))
}

#[cfg(unix)]
fn open_scoped(root: &Path, relative: &Path) -> std::io::Result<File> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW)
        .open(root)?;
    let mut parts = relative.components().peekable();
    while let Some(part) = parts.next() {
        let Component::Normal(name) = part else {
            return Err(std::io::Error::other("invalid image path"));
        };
        let name = CString::new(name.as_bytes())?;
        let directory_flag = match parts.peek() {
            Some(_) => libc::O_DIRECTORY,
            None => 0,
        };
        let fd = unsafe {
            libc::openat(
                file.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY
                    | libc::O_CLOEXEC
                    | libc::O_NOFOLLOW
                    | libc::O_NONBLOCK
                    | directory_flag,
            )
        };
        if fd < 0 {
            return Err(std::io::Error::last_os_error());
        }
        file = unsafe { File::from_raw_fd(fd) };
    }
    Ok(file)
}

#[cfg(not(unix))]
fn open_scoped(_root: &Path, _relative: &Path) -> std::io::Result<File> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "local images are unavailable on this platform",
    ))
}

#[cfg(test)]
mod tests {
    use super::{open_scoped, read_image, resolve_root, MAX_IMAGE_BYTES};
    use rusqlite::Connection;
    use std::fs;
    use std::path::PathBuf;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("goodboy-local-image-{}", rand::random::<u64>()));
            fs::create_dir_all(root.join("out")).unwrap();
            fs::write(root.join("out/chart.png"), PNG).unwrap();
            Self(root)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[cfg(unix)]
    #[test]
    fn reads_relative_and_absolute_images_inside_root() {
        let fixture = Fixture::new();
        for path in [
            PathBuf::from("out/chart.png"),
            fixture.0.join("out/chart.png"),
        ] {
            assert_eq!(
                read_image(&fixture.0, &path).unwrap(),
                "data:image/png;base64,iVBORw0KGgo="
            );
        }
    }

    #[test]
    fn rejects_absolute_images_outside_root() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        assert!(read_image(&fixture.0, &outside.0.join("out/chart.png")).is_err());
    }

    #[test]
    fn rejects_parent_traversal_even_when_it_stays_inside_root() {
        let fixture = Fixture::new();
        assert!(read_image(&fixture.0, &PathBuf::from("out/../out/chart.png")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_file_and_directory_symlink_escapes() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        std::os::unix::fs::symlink(
            outside.0.join("out/chart.png"),
            fixture.0.join("escape.png"),
        )
        .unwrap();
        std::os::unix::fs::symlink(&outside.0, fixture.0.join("escape")).unwrap();
        assert!(read_image(&fixture.0, &PathBuf::from("escape.png")).is_err());
        assert!(read_image(&fixture.0, &PathBuf::from("escape/out/chart.png")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_oversize_files() {
        let fixture = Fixture::new();
        let path = fixture.0.join("out/chart.png");
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(MAX_IMAGE_BYTES + 1)
            .unwrap();
        assert!(read_image(&fixture.0, &path)
            .unwrap_err()
            .contains("15 MiB"));
    }

    #[test]
    fn rejects_svg_and_disguised_markup() {
        let fixture = Fixture::new();
        fs::write(fixture.0.join("shape.svg"), b"<svg/>").unwrap();
        fs::write(fixture.0.join("shape.png"), b"<svg/>").unwrap();
        assert!(read_image(&fixture.0, &PathBuf::from("shape.svg")).is_err());
        assert!(read_image(&fixture.0, &PathBuf::from("shape.png")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn accepts_each_supported_raster_format() {
        let fixture = Fixture::new();
        for (name, bytes, mime) in [
            ("a.JPG", b"\xff\xd8\xff".as_slice(), "image/jpeg"),
            ("a.jpeg", b"\xff\xd8\xff".as_slice(), "image/jpeg"),
            ("a.gif", b"GIF89a".as_slice(), "image/gif"),
            ("a.webp", b"RIFF\0\0\0\0WEBP".as_slice(), "image/webp"),
        ] {
            let path = fixture.0.join(name);
            fs::write(&path, bytes).unwrap();
            assert!(read_image(&fixture.0, &path)
                .unwrap()
                .starts_with(&format!("data:{mime};base64,")));
        }
    }

    #[test]
    fn rejects_directories_and_relative_roots() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.0.join("directory.png")).unwrap();
        assert!(read_image(&fixture.0, &PathBuf::from("directory.png")).is_err());
        assert!(read_image(&PathBuf::from("."), &PathBuf::from("out/chart.png")).is_err());
    }

    fn session_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (id TEXT, workspace_id TEXT, active_project_id TEXT);
             CREATE TABLE projects (id TEXT, workspace_id TEXT, root_path TEXT);
             CREATE TABLE session_worktrees (
                id TEXT, session_id TEXT, project_id TEXT, worktree_path TEXT,
                parallel_index INTEGER, created_at TEXT
             );
             INSERT INTO sessions VALUES ('session', 'workspace', 'active');
             INSERT INTO projects VALUES ('active', 'workspace', '/project');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn resolves_the_active_project_root_without_a_worktree() {
        assert_eq!(resolve_root(&session_db(), "session").unwrap(), "/project");
    }

    #[test]
    fn prefers_the_active_project_worktree_over_other_mounts_and_project_root() {
        let conn = session_db();
        conn.execute_batch(
            "INSERT INTO session_worktrees VALUES
             ('first', 'session', 'other', '/other-mount', 0, '1'),
             ('active', 'session', 'active', '/active-mount', 1, '2');",
        )
        .unwrap();
        assert_eq!(resolve_root(&conn, "session").unwrap(), "/active-mount");
    }

    #[test]
    fn falls_back_to_the_first_session_worktree() {
        let conn = session_db();
        conn.execute_batch(
            "INSERT INTO session_worktrees VALUES
             ('later', 'session', 'other', '/later-mount', 1, '1'),
             ('first', 'session', 'other', '/first-mount', 0, '2');",
        )
        .unwrap();
        assert_eq!(resolve_root(&conn, "session").unwrap(), "/first-mount");
    }

    #[test]
    fn refuses_unknown_sessions_and_sessions_without_a_root() {
        let conn = session_db();
        conn.execute_batch("INSERT INTO sessions VALUES ('empty', 'workspace', NULL);")
            .unwrap();
        assert!(resolve_root(&conn, "unknown").is_err());
        assert!(resolve_root(&conn, "empty").is_err());
    }

    #[test]
    fn refuses_a_project_from_another_workspace() {
        let conn = session_db();
        conn.execute_batch("UPDATE projects SET workspace_id = 'other';")
            .unwrap();
        assert!(resolve_root(&conn, "session").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_file_swapped_for_an_in_root_symlink_after_canonicalization() {
        let fixture = Fixture::new();
        let root = fs::canonicalize(&fixture.0).unwrap();
        let path = fs::canonicalize(root.join("out/chart.png")).unwrap();
        let relative = path.strip_prefix(&root).unwrap();
        fs::rename(&path, root.join("original.png")).unwrap();
        std::os::unix::fs::symlink(root.join("original.png"), &path).unwrap();
        assert!(open_scoped(&root, relative).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_directory_swapped_for_an_in_root_symlink_after_canonicalization() {
        let fixture = Fixture::new();
        let root = fs::canonicalize(&fixture.0).unwrap();
        let path = fs::canonicalize(root.join("out/chart.png")).unwrap();
        let relative = path.strip_prefix(&root).unwrap();
        fs::rename(root.join("out"), root.join("original")).unwrap();
        std::os::unix::fs::symlink(root.join("original"), root.join("out")).unwrap();
        assert!(open_scoped(&root, relative).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_an_image_named_fifo_without_blocking() {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let fixture = Fixture::new();
        let path = fixture.0.join("pipe.png");
        let name = CString::new(path.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        assert_eq!(
            read_image(&fixture.0, &path).unwrap_err(),
            "image must be a regular file"
        );
    }

    #[cfg(unix)]
    #[test]
    fn accepts_an_in_root_hardlink_to_an_image_outside_root() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        let path = fixture.0.join("hardlink.png");
        fs::hard_link(outside.0.join("out/chart.png"), &path).unwrap();
        assert_eq!(
            read_image(&fixture.0, &path).unwrap(),
            "data:image/png;base64,iVBORw0KGgo="
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_non_image_content_in_an_in_root_hardlink() {
        let fixture = Fixture::new();
        let outside = Fixture::new();
        let source = outside.0.join("out/chart.png");
        fs::write(&source, b"not an image").unwrap();
        let path = fixture.0.join("hardlink.png");
        fs::hard_link(&source, &path).unwrap();
        assert_eq!(
            read_image(&fixture.0, &path).unwrap_err(),
            "image content does not match its file type"
        );
    }

    #[cfg(not(unix))]
    #[test]
    fn refuses_local_image_reads_on_unsupported_platforms() {
        let fixture = Fixture::new();
        assert_eq!(
            open_scoped(&fixture.0, &PathBuf::from("out/chart.png"))
                .unwrap_err()
                .kind(),
            std::io::ErrorKind::Unsupported
        );
        assert!(read_image(&fixture.0, &PathBuf::from("out/chart.png")).is_err());
    }
}
