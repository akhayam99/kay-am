use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

const MAX_SLUG_LEN: usize = 48;

#[derive(Debug, Error)]
pub enum WorktreeError {
    #[error("repository not found: {0}")]
    RepoNotFound(String),
    #[error("no git repository at {0}. run git init in that folder, then start a session")]
    NoRepository(String),
    #[error(
        "the git repository at {0} has no commits yet. make the first commit, then start a session"
    )]
    NoCommit(String),
    #[error("git failed: {message}")]
    Git { message: String },
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid utf-8 in git output")]
    InvalidUtf8,
}

crate::util::impl_error_serialize!(WorktreeError);

impl WorktreeError {
    fn kind(&self) -> &'static str {
        match self {
            WorktreeError::RepoNotFound(_) => "repo_not_found",
            WorktreeError::NoRepository(_) => "no_repository",
            WorktreeError::NoCommit(_) => "no_commit",
            WorktreeError::Git { .. } => "git",
            WorktreeError::Io(_) => "io",
            WorktreeError::InvalidUtf8 => "invalid_utf8",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CreatedWorktree {
    #[serde(rename = "worktreePath")]
    pub worktree_path: String,
    #[serde(rename = "branchName")]
    pub branch_name: String,
    pub slug: String,
    pub reused: bool,
}

#[derive(Debug, Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub head: String,
    #[serde(rename = "isMain")]
    pub is_main: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum WorktreeInspection {
    Missing {
        path: String,
    },
    Registered {
        path: String,
        #[serde(rename = "isMain")]
        is_main: bool,
        #[serde(rename = "isLocked")]
        is_locked: bool,
        #[serde(rename = "lockReason")]
        lock_reason: Option<String>,
    },
    ForeignDirectory {
        path: String,
    },
    RepositoryUnavailable {
        path: String,
    },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WorktreeRemovalReason {
    RepositoryUnavailable,
    MainCheckout,
    UnexpectedDirectory,
    DifferentRepository,
    Locked,
    StatusUnavailable,
    StagedChanges,
    UnstagedChanges,
    UntrackedFiles,
    UnmergedConflicts,
    OperationInProgress,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum WorktreeRemovalResult {
    Removed {
        path: String,
    },
    Missing {
        path: String,
    },
    Kept {
        path: String,
        reasons: Vec<WorktreeRemovalReason>,
    },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct WorktreeDirectorySize {
    pub path: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: Option<u64>,
    #[serde(rename = "isPartial")]
    pub is_partial: bool,
    pub exists: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateArgs {
    #[serde(rename = "repoPath")]
    pub repo_path: String,
    #[serde(rename = "branchPrefix")]
    pub branch_prefix: String,
    pub slug: String,
    #[serde(rename = "parentDir")]
    pub parent_dir: Option<String>,
    /// When set, the worktree is created from this existing local branch
    /// instead of cutting a new one. `branch_prefix` and `slug` are still used
    /// to derive the worktree directory name.
    #[serde(rename = "existingBranch", default)]
    pub existing_branch: Option<String>,
    #[serde(rename = "fallbackRef", default)]
    pub fallback_ref: Option<String>,
    /// Base branch to cut a new branch from. Defaults to `main`. The branch is
    /// always cut from `origin/<base>` (not the local copy) so a stale local
    /// `main` cannot leak unrelated commits into the new branch. Ignored when
    /// `existing_branch` is set.
    #[serde(rename = "baseBranch", default)]
    pub base_branch: Option<String>,
    #[serde(rename = "dirName", default)]
    pub dir_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BranchInfo {
    pub name: String,
    /// True when this branch is currently checked out in some worktree.
    #[serde(rename = "inUse")]
    pub in_use: bool,
    /// True when the branch has uncommitted changes in its checkout.
    #[serde(rename = "hasUncommitted")]
    pub has_uncommitted: bool,
}

#[derive(Debug, Deserialize)]
pub struct ChangeBranchArgs {
    #[serde(rename = "repoPath")]
    pub repo_path: String,
    #[serde(rename = "worktreePath")]
    pub worktree_path: String,
    pub branch: String,
    /// When true, create the branch with `git switch -c`. When false, switch to
    /// an existing branch with `git switch`.
    #[serde(rename = "createNew")]
    pub create_new: bool,
}

#[derive(Debug, Deserialize)]
pub struct IntegrateCandidateArgs {
    #[serde(rename = "worktreePath")]
    pub worktree_path: String,
    #[serde(rename = "candidateId")]
    pub candidate_id: String,
    #[serde(rename = "candidateSha")]
    pub candidate_sha: String,
    #[serde(rename = "expectedHead")]
    pub expected_head: String,
}

#[derive(Debug, Deserialize)]
pub struct QuarantineCandidateArgs {
    #[serde(rename = "worktreePath")]
    pub worktree_path: String,
    #[serde(rename = "candidateId")]
    pub candidate_id: String,
    #[serde(rename = "baseSha")]
    pub base_sha: String,
}

#[derive(Debug, Serialize)]
pub struct IntegratedCandidate {
    pub sha: String,
}

#[derive(Debug, Serialize)]
pub struct QuarantinedCandidate {
    pub sha: Option<String>,
    #[serde(rename = "baseSha")]
    pub base_sha: String,
}

fn candidate_ref(candidate_id: &str) -> String {
    format!("refs/goodboy/candidates/{}", sanitize_slug(candidate_id))
}

fn journal_path(cwd: &Path, candidate_id: &str) -> Result<PathBuf, WorktreeError> {
    let git_dir = git(cwd, &["rev-parse", "--absolute-git-dir"])?;
    let dir = Path::new(git_dir.trim()).join("goodboy-candidate-integrations");
    Ok(dir.join(format!("{}.journal", sanitize_slug(candidate_id))))
}

fn is_ancestor(cwd: &Path, ancestor: &str, descendant: &str) -> bool {
    ancestor == descendant
        || git(cwd, &["merge-base", "--is-ancestor", ancestor, descendant]).is_ok()
}

fn ensure_integrable_tree(cwd: &Path) -> Result<(), WorktreeError> {
    let tree = read_working_tree(cwd);
    let blocking = match tree {
        GitWorkingTree::Known {
            staged,
            unstaged,
            unmerged,
            ..
        } => staged + unstaged + unmerged,
        GitWorkingTree::Unknown { .. } => {
            return Err(WorktreeError::Git {
                message: "cannot verify the working tree because git status failed".to_string(),
            })
        }
    };
    if blocking > 0 {
        return Err(WorktreeError::Git {
            message: format!(
                "{blocking} uncommitted change(s) in the worktree: integrating would overwrite them"
            ),
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn worktree_integrate_candidate(
    args: IntegrateCandidateArgs,
) -> Result<IntegratedCandidate, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_integrate_candidate_blocking(args))
        .await
        .map_err(|error| WorktreeError::Io(std::io::Error::other(error.to_string())))?
}

fn worktree_integrate_candidate_blocking(
    args: IntegrateCandidateArgs,
) -> Result<IntegratedCandidate, WorktreeError> {
    let path = Path::new(&args.worktree_path);
    if !path.exists() {
        return Err(WorktreeError::RepoNotFound(args.worktree_path));
    }
    let expected = resolve_commit(path, &args.expected_head)?;
    let candidate = resolve_commit(path, &args.candidate_sha)?;
    let actual = resolve_commit(path, "HEAD")?;
    let journal = journal_path(path, &args.candidate_id)?;
    if journal.exists() {
        let recorded = std::fs::read_to_string(&journal)?;
        if recorded.trim() != candidate {
            return Err(WorktreeError::Git {
                message: "the integration journal holds a different commit for this candidate"
                    .to_string(),
            });
        }
        if is_ancestor(path, &candidate, &actual) {
            return Ok(IntegratedCandidate { sha: candidate });
        }
    }
    if actual != expected {
        return Err(WorktreeError::Git {
            message: format!(
                "the branch moved: expected head {}, found {}",
                short_of(&expected),
                short_of(&actual)
            ),
        });
    }
    if !is_ancestor(path, &expected, &candidate) {
        return Err(WorktreeError::Git {
            message: "the candidate is not based on the expected branch head".to_string(),
        });
    }
    ensure_integrable_tree(path)?;
    let journal_dir = journal.parent().ok_or_else(|| WorktreeError::Git {
        message: "the integration journal has no parent directory".to_string(),
    })?;
    std::fs::create_dir_all(journal_dir)?;
    let pending = journal.with_extension("pending");
    std::fs::write(&pending, format!("{candidate}\n"))?;
    std::fs::rename(&pending, &journal)?;
    git(path, &["update-ref", "HEAD", &candidate, &expected])?;
    git(path, &["reset", "--hard", "--quiet", &candidate])?;
    Ok(IntegratedCandidate { sha: candidate })
}

#[tauri::command]
pub async fn worktree_quarantine_candidate(
    args: QuarantineCandidateArgs,
) -> Result<QuarantinedCandidate, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_quarantine_candidate_blocking(args))
        .await
        .map_err(|error| WorktreeError::Io(std::io::Error::other(error.to_string())))?
}

fn worktree_quarantine_candidate_blocking(
    args: QuarantineCandidateArgs,
) -> Result<QuarantinedCandidate, WorktreeError> {
    let path = Path::new(&args.worktree_path);
    if !path.exists() {
        return Err(WorktreeError::RepoNotFound(args.worktree_path));
    }
    let base = resolve_commit(path, &args.base_sha)?;
    let head = resolve_commit(path, "HEAD")?;
    if !is_ancestor(path, &base, &head) {
        return Err(WorktreeError::Git {
            message: "the branch head is not built on the recorded candidate base".to_string(),
        });
    }
    let is_dirty = match read_working_tree(path) {
        GitWorkingTree::Known { changed, .. } => changed > 0,
        GitWorkingTree::Unknown { .. } => {
            return Err(WorktreeError::Git {
                message: "cannot verify the working tree because git status failed".to_string(),
            })
        }
    };
    if is_dirty {
        git(path, &["add", "--all"])?;
        git(
            path,
            &[
                "commit",
                "--no-verify",
                "--quiet",
                "-m",
                &format!("candidate {}", sanitize_slug(&args.candidate_id)),
            ],
        )?;
    }
    let tip = resolve_commit(path, "HEAD")?;
    if tip == base {
        return Ok(QuarantinedCandidate {
            sha: None,
            base_sha: base,
        });
    }
    git(path, &["update-ref", &candidate_ref(&args.candidate_id), &tip])?;
    git(path, &["update-ref", "HEAD", &base, &tip])?;
    git(path, &["reset", "--hard", "--quiet", &base])?;
    Ok(QuarantinedCandidate {
        sha: Some(tip),
        base_sha: base,
    })
}

pub fn sanitize_slug(input: &str) -> String {
    let lowered = input.to_ascii_lowercase();
    let alnum_dash = Regex::new(r"[^a-z0-9-]+").unwrap();
    let collapsed_dashes = Regex::new(r"-+").unwrap();
    let edge_dashes = Regex::new(r"^-+|-+$").unwrap();

    let stage1 = alnum_dash.replace_all(&lowered, "-");
    let stage2 = collapsed_dashes.replace_all(&stage1, "-");
    let stage3 = edge_dashes.replace_all(&stage2, "");
    let truncated: String = stage3.chars().take(MAX_SLUG_LEN).collect();
    let trimmed = truncated.trim_end_matches('-').to_string();

    if trimmed.is_empty() {
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        format!("{:x}", hasher.finalize()).chars().take(8).collect()
    } else {
        trimmed
    }
}

#[tauri::command]
pub async fn worktree_create(args: CreateArgs) -> Result<CreatedWorktree, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_create_blocking(args))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_create_blocking(args: CreateArgs) -> Result<CreatedWorktree, WorktreeError> {
    let repo_path = PathBuf::from(&args.repo_path);
    if !repo_path.exists() {
        return Err(WorktreeError::RepoNotFound(args.repo_path.clone()));
    }
    if !crate::repo::is_inside_repo(&repo_path) {
        return Err(WorktreeError::NoRepository(args.repo_path.clone()));
    }
    if !crate::repo::has_commit(&repo_path) {
        return Err(WorktreeError::NoCommit(args.repo_path.clone()));
    }

    let slug = sanitize_slug(&args.slug);
    let new_branch_name = format!("{}/{}", args.branch_prefix, slug);
    let existing_branch = args
        .existing_branch
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let branch_name = existing_branch
        .map(|b| b.to_string())
        .unwrap_or_else(|| new_branch_name.clone());

    // Default location: <repo>/.goodboy/worktrees/<prefix>-<slug>. Keeps every
    // session-scoped checkout inside the workspace folder so the user only has
    // one project root to track. The .goodboy dir is excluded from the parent
    // repo's status via .git/info/exclude (see ensure_goodboy_excluded).
    let parent = args
        .parent_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| repo_path.join(".goodboy").join("worktrees"));
    // For existing branches we still derive a unique directory from the
    // sanitized branch (with slashes replaced) so two sessions adopting the
    // same branch don't collide on disk.
    let dir_slug = existing_branch
        .map(sanitize_slug)
        .unwrap_or_else(|| slug.clone());
    let explicit_dir = args
        .dir_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let worktree_path = match explicit_dir {
        Some(name) => parent.join(sanitize_slug(name)),
        None => parent.join(format!("{}-{dir_slug}", args.branch_prefix)),
    };

    if worktree_path.starts_with(&repo_path) {
        ensure_goodboy_excluded(&repo_path);
    }

    if let Some(existing) = find_existing(&repo_path, &worktree_path)? {
        return Ok(CreatedWorktree {
            worktree_path: existing.path,
            branch_name: existing.branch.unwrap_or(branch_name),
            slug,
            reused: true,
        });
    }

    std::fs::create_dir_all(&parent)?;

    if let Some(name) = existing_branch {
        let local_exists = git(
            &repo_path,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("refs/heads/{name}"),
            ],
        )
        .is_ok();
        if local_exists {
            git(
                &repo_path,
                &[
                    "worktree",
                    "add",
                    worktree_path.to_string_lossy().as_ref(),
                    name,
                ],
            )?;
        } else {
            let fallback_ref = args
                .fallback_ref
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty());
            let fetched = git(&repo_path, &["fetch", "origin", name]).is_ok();
            let remote_exists = fetched
                && git(
                    &repo_path,
                    &[
                        "rev-parse",
                        "--verify",
                        "--quiet",
                        &format!("refs/remotes/origin/{name}"),
                    ],
                )
                .is_ok();
            match fallback_ref {
                Some(fallback) if !remote_exists => {
                    git(
                        &repo_path,
                        &["fetch", "origin", &format!("{fallback}:{name}")],
                    )?;
                    git(
                        &repo_path,
                        &[
                            "worktree",
                            "add",
                            worktree_path.to_string_lossy().as_ref(),
                            name,
                        ],
                    )?;
                }
                _ => {
                    git(
                        &repo_path,
                        &[
                            "worktree",
                            "add",
                            "--track",
                            "-b",
                            name,
                            worktree_path.to_string_lossy().as_ref(),
                            &format!("origin/{name}"),
                        ],
                    )?;
                }
            }
        }
    } else {
        let configured_base = args
            .base_branch
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let detected_base = configured_base
            .map(str::to_string)
            .or_else(|| resolve_origin_head(&repo_path));
        if let Some(base) = detected_base.as_deref() {
            try_fetch_origin(&repo_path, base);
        }
        let base_ref = resolve_origin_base(&repo_path, configured_base)?;
        git(
            &repo_path,
            &[
                "worktree",
                "add",
                "-b",
                &branch_name,
                worktree_path.to_string_lossy().as_ref(),
                &base_ref,
            ],
        )?;
    }

    Ok(CreatedWorktree {
        worktree_path: worktree_path.to_string_lossy().to_string(),
        branch_name,
        slug,
        reused: false,
    })
}

#[tauri::command]
pub async fn worktree_list_local_branches(
    repo_path: String,
) -> Result<Vec<BranchInfo>, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || list_local_branches_blocking(repo_path))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

#[tauri::command]
pub async fn worktree_list_branch_names(repo_path: String) -> Result<Vec<String>, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || list_branch_names_blocking(repo_path))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn list_branch_names_blocking(repo_path: String) -> Result<Vec<String>, WorktreeError> {
    let p = Path::new(&repo_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(repo_path));
    }
    let raw = git(
        p,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    Ok(normalize_branch_names(&raw))
}

fn normalize_branch_names(raw: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut names = Vec::new();
    for line in raw.lines() {
        let name = line.trim();
        if name.is_empty() || name == "origin" || name.ends_with("/HEAD") {
            continue;
        }
        let normalized = name.strip_prefix("origin/").unwrap_or(name);
        if seen.insert(normalized.to_string()) {
            names.push(normalized.to_string());
        }
    }
    names
}

fn list_local_branches_blocking(repo_path: String) -> Result<Vec<BranchInfo>, WorktreeError> {
    let p = Path::new(&repo_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(repo_path));
    }
    let raw = git(
        p,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )?;
    let worktrees = parse_porcelain(&git(p, &["worktree", "list", "--porcelain"])?);
    let in_use_branches: std::collections::HashSet<String> =
        worktrees.iter().filter_map(|w| w.branch.clone()).collect();
    let uncommitted = uncommitted_status_by_branch(&worktrees, &in_use_branches);
    let mut branches = Vec::new();
    for line in raw.lines() {
        let name = line.trim();
        if name.is_empty() {
            continue;
        }
        let in_use = in_use_branches.contains(name);
        let has_uncommitted = uncommitted.get(name).copied().unwrap_or(false);
        branches.push(BranchInfo {
            name: name.to_string(),
            in_use,
            has_uncommitted,
        });
    }
    Ok(branches)
}

fn uncommitted_status_by_branch(
    worktrees: &[WorktreeInfo],
    in_use_branches: &std::collections::HashSet<String>,
) -> std::collections::HashMap<String, bool> {
    let targets: Vec<(&str, &str)> = worktrees
        .iter()
        .filter_map(|w| {
            let branch = w.branch.as_deref()?;
            in_use_branches
                .contains(branch)
                .then_some((branch, w.path.as_str()))
        })
        .collect();
    std::thread::scope(|scope| {
        targets
            .iter()
            .map(|(branch, path)| (*branch, scope.spawn(move || worktree_has_uncommitted(path))))
            .collect::<Vec<_>>()
            .into_iter()
            .map(|(branch, handle)| (branch.to_string(), handle.join().unwrap_or(false)))
            .collect()
    })
}

fn worktree_has_uncommitted(path: &str) -> bool {
    git(Path::new(path), &["status", "--porcelain"])
        .map(|out| !out.trim().is_empty())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn worktree_change_branch(args: ChangeBranchArgs) -> Result<(), WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_change_branch_blocking(args))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_change_branch_blocking(args: ChangeBranchArgs) -> Result<(), WorktreeError> {
    let wt = Path::new(&args.worktree_path);
    if !wt.exists() {
        return Err(WorktreeError::RepoNotFound(args.worktree_path.clone()));
    }
    let trimmed = args.branch.trim();
    if trimmed.is_empty() {
        return Err(WorktreeError::Git {
            message: "branch name is empty".to_string(),
        });
    }
    if trimmed.starts_with('-') {
        return Err(WorktreeError::Git {
            message: "branch name cannot start with '-'".to_string(),
        });
    }
    if args.create_new {
        git(wt, &["switch", "-c", trimmed])?;
    } else {
        git(wt, &["switch", trimmed])?;
    }
    Ok(())
}

const REMOVE_RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(300);

fn is_directory_not_empty(error: &WorktreeError) -> bool {
    let WorktreeError::Git { message } = error else {
        return false;
    };
    let lowered = message.to_ascii_lowercase();
    lowered.contains("directory not empty") || lowered.contains("failed to delete")
}

#[derive(Debug)]
struct RegisteredWorktree {
    path: String,
    is_main: bool,
    is_locked: bool,
    lock_reason: Option<String>,
}

fn registered_worktrees_with(
    repo_path: &Path,
    run_git: &mut dyn FnMut(&Path, &[&str]) -> Result<String, WorktreeError>,
) -> Result<Vec<RegisteredWorktree>, WorktreeError> {
    let output = run_git(repo_path, &["worktree", "list", "--porcelain"])?;
    Ok(parse_registered_worktrees(&output))
}

fn canonical_path(path: &Path) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

fn common_git_dir_with(
    path: &Path,
    run_git: &mut dyn FnMut(&Path, &[&str]) -> Result<String, WorktreeError>,
) -> Option<PathBuf> {
    let raw = run_git(path, &["rev-parse", "--git-common-dir"]).ok()?;
    let value = PathBuf::from(raw.trim());
    let resolved = match value.is_absolute() {
        true => value,
        false => path.join(value),
    };
    canonical_path(&resolved)
}

fn repository_top_level_with(
    path: &Path,
    run_git: &mut dyn FnMut(&Path, &[&str]) -> Result<String, WorktreeError>,
) -> Option<PathBuf> {
    let raw = run_git(path, &["rev-parse", "--show-toplevel"]).ok()?;
    canonical_path(Path::new(raw.trim()))
}

fn inspect_worktree_with(
    repo_path: &Path,
    worktree_path: &Path,
    run_git: &mut dyn FnMut(&Path, &[&str]) -> Result<String, WorktreeError>,
) -> WorktreeInspection {
    let requested_path = worktree_path.to_string_lossy().into_owned();
    if !repo_path.is_dir() || canonical_path(repo_path).is_none() {
        return WorktreeInspection::RepositoryUnavailable {
            path: requested_path,
        };
    }
    let registered = match registered_worktrees_with(repo_path, run_git) {
        Ok(found) => found,
        Err(_) => {
            return WorktreeInspection::RepositoryUnavailable {
                path: requested_path,
            };
        }
    };
    let Some(repository_common) = common_git_dir_with(repo_path, run_git) else {
        return WorktreeInspection::RepositoryUnavailable {
            path: requested_path,
        };
    };
    if !worktree_path.exists() {
        return WorktreeInspection::Missing {
            path: requested_path,
        };
    }
    let Some(target) = canonical_path(worktree_path) else {
        return WorktreeInspection::ForeignDirectory {
            path: requested_path,
        };
    };
    let target_key = target.to_string_lossy().into_owned();
    for entry in registered {
        let Some(entry_path) = canonical_path(Path::new(&entry.path)) else {
            continue;
        };
        if entry_path != target {
            continue;
        }
        if repository_top_level_with(&target, run_git) != Some(target.clone()) {
            return WorktreeInspection::ForeignDirectory { path: target_key };
        }
        if common_git_dir_with(&target, run_git) != Some(repository_common.clone()) {
            return WorktreeInspection::ForeignDirectory { path: target_key };
        }
        return WorktreeInspection::Registered {
            path: target_key,
            is_main: entry.is_main,
            is_locked: entry.is_locked,
            lock_reason: entry.lock_reason,
        };
    }
    WorktreeInspection::ForeignDirectory { path: target_key }
}

fn foreign_directory_reason_with(
    repo_path: &Path,
    target_path: &Path,
    run_git: &mut dyn FnMut(&Path, &[&str]) -> Result<String, WorktreeError>,
) -> WorktreeRemovalReason {
    let repository_common = common_git_dir_with(repo_path, run_git);
    let target_common = common_git_dir_with(target_path, run_git);
    if repository_common.is_some() && target_common.is_some() && repository_common != target_common
    {
        return WorktreeRemovalReason::DifferentRepository;
    }
    WorktreeRemovalReason::UnexpectedDirectory
}

fn status_removal_reasons_with(
    worktree_path: &Path,
    run_git: &mut dyn FnMut(&Path, &[&str]) -> Result<String, WorktreeError>,
) -> Vec<WorktreeRemovalReason> {
    let raw = match run_git(worktree_path, &["status", "--porcelain=v1"]) {
        Ok(found) => found,
        Err(_) => return vec![WorktreeRemovalReason::StatusUnavailable],
    };
    let mut reasons = Vec::new();
    if let GitWorkingTree::Known {
        staged,
        unstaged,
        untracked,
        unmerged,
        ..
    } = parse_working_tree(&raw)
    {
        if staged > 0 {
            reasons.push(WorktreeRemovalReason::StagedChanges);
        }
        if unstaged > 0 {
            reasons.push(WorktreeRemovalReason::UnstagedChanges);
        }
        if untracked > 0 {
            reasons.push(WorktreeRemovalReason::UntrackedFiles);
        }
        if unmerged > 0 {
            reasons.push(WorktreeRemovalReason::UnmergedConflicts);
        }
    }
    if in_progress_operation(worktree_path).is_some() {
        reasons.push(WorktreeRemovalReason::OperationInProgress);
    }
    reasons
}

fn validate_removal_with(
    repo_path: &Path,
    worktree_path: &Path,
    run_git: &mut dyn FnMut(&Path, &[&str]) -> Result<String, WorktreeError>,
) -> Result<PathBuf, WorktreeRemovalResult> {
    match inspect_worktree_with(repo_path, worktree_path, run_git) {
        WorktreeInspection::RepositoryUnavailable { path } => Err(WorktreeRemovalResult::Kept {
            path,
            reasons: vec![WorktreeRemovalReason::RepositoryUnavailable],
        }),
        WorktreeInspection::Missing { path } => Err(WorktreeRemovalResult::Missing { path }),
        WorktreeInspection::ForeignDirectory { path } => {
            let reason = foreign_directory_reason_with(repo_path, worktree_path, run_git);
            Err(WorktreeRemovalResult::Kept {
                path,
                reasons: vec![reason],
            })
        }
        WorktreeInspection::Registered {
            path,
            is_main: true,
            ..
        } => Err(WorktreeRemovalResult::Kept {
            path,
            reasons: vec![WorktreeRemovalReason::MainCheckout],
        }),
        WorktreeInspection::Registered {
            path,
            is_locked: true,
            ..
        } => Err(WorktreeRemovalResult::Kept {
            path,
            reasons: vec![WorktreeRemovalReason::Locked],
        }),
        WorktreeInspection::Registered { path, .. } => {
            let target = PathBuf::from(&path);
            let reasons = status_removal_reasons_with(&target, run_git);
            if !reasons.is_empty() {
                return Err(WorktreeRemovalResult::Kept { path, reasons });
            }
            Ok(target)
        }
    }
}

pub(crate) fn remove_worktree_checked_with(
    repo_path: &Path,
    worktree_path: &Path,
    run_git: &mut dyn FnMut(&Path, &[&str]) -> Result<String, WorktreeError>,
) -> Result<WorktreeRemovalResult, WorktreeError> {
    let target = match validate_removal_with(repo_path, worktree_path, run_git) {
        Ok(found) => found,
        Err(result) => return Ok(result),
    };
    let target_string = target.to_string_lossy().into_owned();
    let remove_args = ["worktree", "remove", "--force", target_string.as_str()];
    let first = run_git(repo_path, &remove_args);
    if first.is_ok() {
        return Ok(WorktreeRemovalResult::Removed {
            path: target_string,
        });
    }
    let error = first.unwrap_err();
    if !is_directory_not_empty(&error) {
        return Err(error);
    }
    std::thread::sleep(REMOVE_RETRY_DELAY);
    match validate_removal_with(repo_path, &target, run_git) {
        Ok(_) => {}
        Err(WorktreeRemovalResult::Missing { .. }) => {
            return Ok(WorktreeRemovalResult::Removed {
                path: target_string,
            });
        }
        Err(result) => return Ok(result),
    }
    if run_git(repo_path, &remove_args).is_ok() {
        return Ok(WorktreeRemovalResult::Removed {
            path: target_string,
        });
    }
    match validate_removal_with(repo_path, &target, run_git) {
        Ok(revalidated) if revalidated == target => {}
        Ok(_) => {
            return Ok(WorktreeRemovalResult::Kept {
                path: target_string,
                reasons: vec![WorktreeRemovalReason::UnexpectedDirectory],
            });
        }
        Err(WorktreeRemovalResult::Missing { .. }) => {
            return Ok(WorktreeRemovalResult::Removed {
                path: target_string,
            });
        }
        Err(result) => return Ok(result),
    }
    if target.exists() {
        std::fs::remove_dir_all(&target)?;
    }
    let _ = run_git(repo_path, &["worktree", "prune"]);
    if target.exists() {
        return Err(WorktreeError::Git {
            message: format!(
                "worktree folder is still on disk after cleanup: {target_string}. close anything running inside it and remove it by hand"
            ),
        });
    }
    Ok(WorktreeRemovalResult::Removed {
        path: target_string,
    })
}

#[tauri::command]
pub async fn worktree_inspect(
    repo_path: String,
    worktree_path: String,
) -> Result<WorktreeInspection, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(inspect_worktree_with(
            Path::new(&repo_path),
            Path::new(&worktree_path),
            &mut |cwd, args| git(cwd, args),
        ))
    })
    .await
    .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

#[tauri::command]
pub async fn worktree_git_common_dir(repo_path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        common_git_dir_with(Path::new(&repo_path), &mut |cwd, args| git(cwd, args))
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn worktree_remove_checked(
    repo_path: String,
    worktree_path: String,
) -> Result<WorktreeRemovalResult, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || {
        worktree_remove_checked_blocking(repo_path, worktree_path)
    })
    .await
    .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_remove_checked_blocking(
    repo_path: String,
    worktree_path: String,
) -> Result<WorktreeRemovalResult, WorktreeError> {
    remove_worktree_checked_with(
        Path::new(&repo_path),
        Path::new(&worktree_path),
        &mut |cwd, args| git(cwd, args),
    )
}

fn exclude_file_path(repo_path: &Path) -> Option<PathBuf> {
    let raw = git(repo_path, &["rev-parse", "--git-common-dir"]).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let dir = PathBuf::from(trimmed);
    let resolved = if dir.is_absolute() {
        dir
    } else {
        repo_path.join(dir)
    };
    Some(resolved.join("info").join("exclude"))
}

pub(crate) fn remove_goodboy_exclude_entry(repo_path: &Path) {
    let Some(file) = exclude_file_path(repo_path) else {
        return;
    };
    let Ok(existing) = std::fs::read_to_string(&file) else {
        return;
    };
    let next: String = existing
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed != ".goodboy/" && trimmed != "/.goodboy/" && trimmed != ".goodboy"
        })
        .map(|line| format!("{line}\n"))
        .collect();
    if next != existing {
        let _ = std::fs::write(&file, next);
    }
}

pub(crate) fn tidy_goodboy_dir(repo_path: &Path) {
    let _ = std::fs::remove_dir(worktrees_parent(repo_path));
    let goodboy_dir = repo_path.join(WORKTREE_PARENT[0]);
    let _ = std::fs::remove_dir(&goodboy_dir);
    if goodboy_dir.exists() {
        return;
    }
    remove_goodboy_exclude_entry(repo_path);
}

#[tauri::command]
pub async fn worktree_tidy_goodboy(repo_path: String) -> Result<(), WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_tidy_goodboy_blocking(repo_path))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_tidy_goodboy_blocking(repo_path: String) -> Result<(), WorktreeError> {
    tidy_goodboy_dir(Path::new(&repo_path));
    Ok(())
}

pub(crate) fn ensure_goodboy_excluded(repo_path: &Path) {
    let Some(file) = exclude_file_path(repo_path) else {
        return;
    };
    let existing = std::fs::read_to_string(&file).unwrap_or_default();
    let has_entry = existing.lines().any(|line| {
        let trimmed = line.trim();
        trimmed == ".goodboy/" || trimmed == "/.goodboy/" || trimmed == ".goodboy"
    });
    if has_entry {
        return;
    }
    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(".goodboy/\n");
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&file, next);
}

const WORKTREE_PARENT: [&str; 2] = [".goodboy", "worktrees"];

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct OrphanWorktree {
    pub path: String,
    pub name: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "isRegistered")]
    pub is_registered: bool,
}

fn worktrees_parent(repo_path: &Path) -> PathBuf {
    repo_path.join(WORKTREE_PARENT[0]).join(WORKTREE_PARENT[1])
}

fn canonical_key(path: &Path) -> String {
    std::fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

fn directory_size(path: &Path) -> (Option<u64>, bool) {
    let entries = match std::fs::read_dir(path) {
        Ok(found) => found,
        Err(_) => return (None, true),
    };
    let mut total = 0u64;
    let mut is_partial = false;
    for entry in entries {
        let entry = match entry {
            Ok(found) => found,
            Err(_) => {
                is_partial = true;
                continue;
            }
        };
        let file_type = match entry.file_type() {
            Ok(found) => found,
            Err(_) => {
                is_partial = true;
                continue;
            }
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            let (size, child_partial) = directory_size(&entry.path());
            is_partial = is_partial || child_partial;
            if let Some(found) = size {
                total = total.saturating_add(found);
            }
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        match entry.metadata() {
            Ok(meta) => total = total.saturating_add(meta.len()),
            Err(_) => is_partial = true,
        }
    }
    (Some(total), is_partial)
}

fn worktree_directory_size_blocking(path: String) -> WorktreeDirectorySize {
    let target = Path::new(&path);
    let metadata = match std::fs::symlink_metadata(target) {
        Ok(found) => found,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return WorktreeDirectorySize {
                path,
                size_bytes: None,
                is_partial: false,
                exists: false,
            };
        }
        Err(_) => {
            return WorktreeDirectorySize {
                path,
                size_bytes: None,
                is_partial: true,
                exists: true,
            };
        }
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return WorktreeDirectorySize {
            path,
            size_bytes: None,
            is_partial: true,
            exists: true,
        };
    }
    let (size_bytes, is_partial) = directory_size(target);
    WorktreeDirectorySize {
        path,
        size_bytes,
        is_partial,
        exists: true,
    }
}

#[tauri::command]
pub async fn worktree_directory_size(path: String) -> Result<WorktreeDirectorySize, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_directory_size_blocking(path))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))
}

pub(crate) fn collect_orphans(
    repo_path: &Path,
    registered: &[String],
    known_paths: &[String],
) -> Vec<OrphanWorktree> {
    let parent = worktrees_parent(repo_path);
    let parent_key = canonical_key(&parent);
    let claimed: std::collections::HashSet<String> = known_paths
        .iter()
        .map(|p| canonical_key(Path::new(p)))
        .collect();
    let registered_keys: std::collections::HashSet<String> = registered
        .iter()
        .map(|p| canonical_key(Path::new(p)))
        .collect();
    let mut candidates: Vec<PathBuf> = std::fs::read_dir(&parent)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| path.is_dir())
                .collect()
        })
        .unwrap_or_default();
    for path in registered.iter().map(PathBuf::from) {
        let inside = path
            .parent()
            .map(|dir| canonical_key(dir) == parent_key)
            .unwrap_or(false);
        if !inside || !path.is_dir() {
            continue;
        }
        if candidates
            .iter()
            .any(|known| canonical_key(known) == canonical_key(&path))
        {
            continue;
        }
        candidates.push(path);
    }
    let mut orphans: Vec<OrphanWorktree> = candidates
        .into_iter()
        .filter(|path| !claimed.contains(&canonical_key(path)))
        .map(|path| OrphanWorktree {
            name: path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            size_bytes: directory_size(&path).0.unwrap_or(0),
            is_registered: registered_keys.contains(&canonical_key(&path)),
            path: path.to_string_lossy().into_owned(),
        })
        .collect();
    orphans.sort_by(|a, b| a.path.cmp(&b.path));
    orphans
}

#[tauri::command]
pub async fn worktree_orphans(
    repo_path: String,
    known_paths: Vec<String>,
) -> Result<Vec<OrphanWorktree>, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Path::new(&repo_path);
        if !worktrees_parent(repo).is_dir() {
            return Ok(Vec::new());
        }
        let registered: Vec<String> = git(repo, &["worktree", "list", "--porcelain"])
            .map(|stdout| {
                parse_porcelain(&stdout)
                    .into_iter()
                    .filter(|entry| !entry.is_main)
                    .map(|entry| entry.path)
                    .collect()
            })
            .unwrap_or_default();
        Ok(collect_orphans(repo, &registered, &known_paths))
    })
    .await
    .map_err(|e| WorktreeError::Git {
        message: e.to_string(),
    })?
}

#[tauri::command]
pub async fn worktree_orphan_remove(repo_path: String, path: String) -> Result<(), WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_orphan_remove_blocking(repo_path, path))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_orphan_remove_blocking(repo_path: String, path: String) -> Result<(), WorktreeError> {
    let repo = Path::new(&repo_path);
    let parent = worktrees_parent(repo);
    let target = Path::new(&path);
    let parent_key = canonical_key(&parent);
    let is_contained = target
        .parent()
        .map(|p| canonical_key(p) == parent_key)
        .unwrap_or(false);
    if !is_contained {
        return Err(WorktreeError::Git {
            message: format!("refusing to remove a path outside {parent_key}: {path}"),
        });
    }
    if target.exists() {
        std::fs::remove_dir_all(target)?;
    }
    let _ = git(repo, &["worktree", "prune"]);
    Ok(())
}

#[tauri::command]
pub async fn worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_list_blocking(repo_path))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_list_blocking(repo_path: String) -> Result<Vec<WorktreeInfo>, WorktreeError> {
    let stdout = git(Path::new(&repo_path), &["worktree", "list", "--porcelain"])?;
    Ok(parse_porcelain(&stdout))
}

#[tauri::command]
pub async fn worktree_remote_url(repo_path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || worktree_remote_url_blocking(repo_path))
        .await
        .unwrap_or(None)
}

fn worktree_remote_url_blocking(repo_path: String) -> Option<String> {
    git(Path::new(&repo_path), &["remote", "get-url", "origin"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[tauri::command]
pub async fn worktree_diff(
    worktree_path: String,
    base_branch: Option<String>,
) -> Result<String, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_diff_blocking(worktree_path, base_branch))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_diff_blocking(
    worktree_path: String,
    base_branch: Option<String>,
) -> Result<String, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    let configured_base = normalized_base(base_branch.as_deref());
    let resolved = resolve_base(p, configured_base)
        .map(|(_, merge_base)| merge_base)
        .ok_or_else(|| WorktreeError::Git {
            message: "cannot resolve base branch merge-base".to_string(),
        })?;
    let tracked = git(p, &["diff", &resolved])?;
    Ok(format!("{tracked}{}", untracked_new_file_diffs(p)))
}

/// Unified diff for a SINGLE file `rel_path` inside the worktree, against the
/// same merge-base `worktree_diff` uses. The path is taken as worktree-relative
/// and confined to the worktree: any `..` traversal or path that resolves
/// outside the worktree root is refused. Untracked files fall back to the same
/// synthetic new-file diff `worktree_diff` emits.
#[tauri::command]
pub async fn worktree_diff_file(
    worktree_path: String,
    base_branch: Option<String>,
    path: String,
) -> Result<String, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || {
        worktree_diff_file_blocking(worktree_path, base_branch, path)
    })
    .await
    .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_diff_file_blocking(
    worktree_path: String,
    base_branch: Option<String>,
    path: String,
) -> Result<String, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    let rel = confine_rel_path(p, &path)?;
    let configured_base = normalized_base(base_branch.as_deref());
    let resolved = resolve_base(p, configured_base)
        .map(|(_, merge_base)| merge_base)
        .ok_or_else(|| WorktreeError::Git {
            message: "cannot resolve base branch merge-base".to_string(),
        })?;
    // `-- <path>` scopes the diff to the one file. Pathspec is anchored at the
    // worktree root (already confined above), so no traversal is possible.
    let tracked = git(p, &["diff", &resolved, "--", &rel])?;
    if !tracked.is_empty() {
        return Ok(tracked);
    }
    // No tracked diff: the file may be untracked (new). Emit the synthetic
    // new-file diff for just this path, mirroring `untracked_new_file_diffs`.
    Ok(untracked_new_file_diff_for(p, &rel))
}

/// Resolve `path` as a worktree-relative path and verify it stays inside the
/// worktree root. Returns the normalized relative path (forward-slashed) for use
/// as a git pathspec. Refuses absolute paths and any `..` escape.
fn confine_rel_path(worktree: &Path, path: &str) -> Result<String, WorktreeError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(WorktreeError::Git {
            message: "diff path is empty".to_string(),
        });
    }
    let candidate = Path::new(trimmed);
    let abs = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        worktree.join(candidate)
    };
    // Reject any `..` component up front (cheap, no fs access) so we never even
    // canonicalize a traversal attempt.
    if abs
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(WorktreeError::Git {
            message: "diff path escapes the worktree".to_string(),
        });
    }
    let root = worktree
        .canonicalize()
        .unwrap_or_else(|_| worktree.to_path_buf());
    // Canonicalize when the file exists (resolves symlinks); fall back to the
    // lexical join for not-yet-existing (e.g. untracked-but-deleted) paths.
    let resolved = abs.canonicalize().unwrap_or(abs);
    if !resolved.starts_with(&root) {
        return Err(WorktreeError::Git {
            message: "diff path escapes the worktree".to_string(),
        });
    }
    let rel = resolved
        .strip_prefix(&root)
        .unwrap_or(&resolved)
        .to_string_lossy()
        .replace('\\', "/");
    if rel.is_empty() {
        return Err(WorktreeError::Git {
            message: "diff path resolves to the worktree root".to_string(),
        });
    }
    Ok(rel)
}

#[derive(Debug, Serialize)]
pub struct ChangedFilesSummary {
    pub paths: Vec<String>,
    pub additions: u32,
    pub deletions: u32,
    /// Raw per-file numstat lines for the SAME change set as `paths` —
    /// "<adds>\t<dels>\t<path>" (binary files: "-\t-\t<path>"), one per line,
    /// INCLUDING untracked files (counted as additions, deletions 0). This is the
    /// source of truth mirrored to the mobile `files_touched_numstat` context
    /// slot, so the phone gets both the file list and the +/- counts from one
    /// value computed against the same merge-base the desktop's own view uses.
    pub numstat: String,
}

/// Distinct file paths that differ between the worktree (including uncommitted
/// + untracked) and the merge-base with the given base branch, plus aggregate
/// line +/- totals.
///
/// Stable across "before vs after push": pushing commits doesn't shrink the
/// count because we diff against the merge-base, not `HEAD`. Untracked files
/// contribute their line count to additions.
#[tauri::command]
pub async fn worktree_changed_files(
    worktree_path: String,
    base_branch: Option<String>,
) -> Result<ChangedFilesSummary, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || {
        worktree_changed_files_blocking(worktree_path, base_branch)
    })
    .await
    .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_changed_files_blocking(
    worktree_path: String,
    base_branch: Option<String>,
) -> Result<ChangedFilesSummary, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    let configured_base = normalized_base(base_branch.as_deref());
    let resolved = resolve_base(p, configured_base)
        .map(|(_, merge_base)| merge_base)
        .ok_or_else(|| WorktreeError::Git {
            message: "cannot resolve base branch merge-base".to_string(),
        })?;
    let tracked_numstat = git(p, &["diff", "--numstat", &resolved]).unwrap_or_default();
    let mut additions: u32 = 0;
    let mut deletions: u32 = 0;
    let mut set: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    // Collect the per-file numstat lines so we can mirror them verbatim into the
    // `files_touched_numstat` context slot (same merge-base as above).
    let mut numstat_lines: Vec<String> = Vec::new();
    for line in tracked_numstat.lines() {
        // numstat format: "<adds>\t<dels>\t<path>" — binary files show "-\t-\t<path>"
        let mut parts = line.splitn(3, '\t');
        let add_s = parts.next().unwrap_or("");
        let del_s = parts.next().unwrap_or("");
        let path = parts.next().unwrap_or("").trim();
        if path.is_empty() {
            continue;
        }
        if let Ok(a) = add_s.parse::<u32>() {
            additions = additions.saturating_add(a);
        }
        if let Ok(d) = del_s.parse::<u32>() {
            deletions = deletions.saturating_add(d);
        }
        set.insert(path.to_string());
        // Preserve git's exact line (including "-\t-\t" for binary).
        numstat_lines.push(format!("{add_s}\t{del_s}\t{path}"));
    }
    // Untracked files: contribute their content as additions. `git diff` doesn't
    // see them, so synthesize a numstat line ("<lines>\t0\t<path>") to keep the
    // slot's file list complete and the +/- counts consistent with `additions`.
    let untracked = git(p, &["ls-files", "--others", "--exclude-standard"]).unwrap_or_default();
    for line in untracked.lines() {
        let rel = line.trim();
        if rel.is_empty() {
            continue;
        }
        set.insert(rel.to_string());
        match std::fs::read(p.join(rel)) {
            Ok(bytes) if bytes.contains(&0) => {
                // Binary untracked file — mirror git's "-\t-\t<path>" form.
                numstat_lines.push(format!("-\t-\t{rel}"));
            }
            Ok(bytes) => {
                let n = String::from_utf8_lossy(&bytes).lines().count() as u32;
                additions = additions.saturating_add(n);
                numstat_lines.push(format!("{n}\t0\t{rel}"));
            }
            Err(_) => {
                numstat_lines.push(format!("0\t0\t{rel}"));
            }
        }
    }
    Ok(ChangedFilesSummary {
        paths: set.into_iter().collect(),
        additions,
        deletions,
        numstat: numstat_lines.join("\n"),
    })
}

#[derive(Debug, Serialize)]
pub struct BranchCommit {
    pub sha: String,
    #[serde(rename = "shortSha")]
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    pub timestamp: i64,
    pub pushed: bool,
    #[serde(rename = "parentSha")]
    pub parent_sha: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GitUnknownReason {
    NoUpstream,
    DetachedHead,
    RevListFailed,
    MainRefUnresolved,
    StatusReadFailed,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum GitDistance {
    Known { ahead: u32, behind: u32 },
    Unknown { reason: GitUnknownReason },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum GitWorkingTree {
    Known {
        staged: u32,
        unstaged: u32,
        untracked: u32,
        unmerged: u32,
        changed: u32,
    },
    Unknown {
        reason: GitUnknownReason,
    },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GitOperation {
    Merge,
    Rebase,
    CherryPick,
    Bisect,
}

#[derive(Debug, Serialize)]
pub struct WorktreeStatus {
    pub branch: Option<String>,
    pub head: Option<String>,
    #[serde(rename = "headSubject")]
    pub head_subject: Option<String>,
    #[serde(rename = "upstreamDistance")]
    pub upstream_distance: GitDistance,
    #[serde(rename = "mainDistance")]
    pub main_distance: GitDistance,
    #[serde(rename = "workingTree")]
    pub working_tree: GitWorkingTree,
    #[serde(rename = "upstream")]
    pub upstream: Option<String>,
    #[serde(rename = "inProgress")]
    pub in_progress: Option<GitOperation>,
}

const COMMIT_LIMIT: usize = 100;
const COMMIT_FORMAT: &str = "%H%x1f%h%x1f%s%x1f%an%x1f%at%x1f%P";

#[tauri::command]
pub async fn worktree_commits(worktree_path: String) -> Result<Vec<BranchCommit>, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_commits_blocking(worktree_path))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_commits_blocking(worktree_path: String) -> Result<Vec<BranchCommit>, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    let upstream_ref = resolve_upstream(p);
    let unpushed = if let Some(ref upstream) = upstream_ref {
        rev_list_set(p, &format!("{upstream}..HEAD"))
    } else {
        rev_list_set(p, "HEAD")
            .into_iter()
            .take(COMMIT_LIMIT)
            .collect()
    };

    let branch_range = resolve_branch_range(p);
    let log_args: Vec<String> = vec![
        "log".to_string(),
        format!("-n{COMMIT_LIMIT}"),
        format!("--format={COMMIT_FORMAT}"),
        branch_range,
    ];
    let raw = git_strs(p, &log_args)?;
    let mut commits = Vec::new();
    for line in raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\u{1f}').collect();
        if parts.len() < 6 {
            continue;
        }
        let sha = parts[0].to_string();
        let parents: Vec<&str> = parts[5].split_whitespace().collect();
        let parent_sha = parents.first().map(|s| s.to_string());
        let pushed = !unpushed.contains(&sha);
        let timestamp = parts[4].parse::<i64>().unwrap_or(0);
        commits.push(BranchCommit {
            sha,
            short_sha: parts[1].to_string(),
            subject: parts[2].to_string(),
            author: parts[3].to_string(),
            timestamp,
            pushed,
            parent_sha,
        });
    }
    Ok(commits)
}

#[tauri::command]
pub async fn worktree_is_ancestor(
    worktree_path: String,
    sha: String,
    head: String,
) -> Result<bool, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || {
        worktree_is_ancestor_blocking(worktree_path, sha, head)
    })
    .await
    .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_is_ancestor_blocking(
    worktree_path: String,
    sha: String,
    head: String,
) -> Result<bool, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    let output = crate::path_env::command("git")
        .args(["merge-base", "--is-ancestor", &sha, &head])
        .current_dir(p)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()?;
    Ok(output.status.success())
}

#[tauri::command]
pub async fn worktree_remote_head(
    worktree_path: String,
    branch: String,
) -> Result<Option<String>, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_remote_head_blocking(worktree_path, branch))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_remote_head_blocking(
    worktree_path: String,
    branch: String,
) -> Result<Option<String>, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    let reference = format!("refs/heads/{branch}");
    let raw = git(p, &["ls-remote", "origin", &reference])?;
    Ok(raw
        .lines()
        .find_map(|line| line.split_whitespace().next())
        .map(|sha| sha.to_string()))
}

#[derive(Debug, Deserialize)]
pub struct RewriteArgs {
    #[serde(rename = "worktreePath")]
    pub worktree_path: String,
    pub sha: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct RewrittenHead {
    pub sha: String,
    #[serde(rename = "shortSha")]
    pub short_sha: String,
    pub replaced: Vec<String>,
}

#[tauri::command]
pub async fn worktree_amend_commit(args: RewriteArgs) -> Result<RewrittenHead, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_amend_commit_blocking(args))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_amend_commit_blocking(args: RewriteArgs) -> Result<RewrittenHead, WorktreeError> {
    let p = Path::new(&args.worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(args.worktree_path.clone()));
    }
    let message = require_message(&args.message)?;
    let target = resolve_commit(p, &args.sha)?;
    let head = resolve_commit(p, "HEAD")?;
    if target != head {
        return Err(WorktreeError::Git {
            message: format!(
                "only the newest local commit can be amended: {} is behind HEAD",
                short_of(&target)
            ),
        });
    }
    ensure_unpushed(p, std::slice::from_ref(&target))?;
    ensure_nothing_staged(p)?;
    git(p, &["commit", "--amend", "-m", &message])?;
    head_of(p, vec![target])
}

#[tauri::command]
pub async fn worktree_squash_commits(args: RewriteArgs) -> Result<RewrittenHead, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_squash_commits_blocking(args))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_squash_commits_blocking(args: RewriteArgs) -> Result<RewrittenHead, WorktreeError> {
    let p = Path::new(&args.worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(args.worktree_path.clone()));
    }
    let message = require_message(&args.message)?;
    let oldest = resolve_commit(p, &args.sha)?;
    let head = resolve_commit(p, "HEAD")?;
    if oldest == head {
        return Err(WorktreeError::Git {
            message: "squash needs at least two commits: pick an older one".to_string(),
        });
    }
    if git(p, &["merge-base", "--is-ancestor", &oldest, &head]).is_err() {
        return Err(WorktreeError::Git {
            message: format!("{} is not an ancestor of HEAD", short_of(&oldest)),
        });
    }
    let mut range: Vec<String> = git(p, &["rev-list", &format!("{oldest}..{head}")])
        .map(|out| {
            out.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        })
        .unwrap_or_default();
    range.push(oldest.clone());
    ensure_unpushed(p, &range)?;
    ensure_nothing_staged(p)?;
    let parent = git(
        p,
        &["rev-parse", "--verify", "--quiet", &format!("{oldest}^")],
    )
    .map(|out| out.trim().to_string())
    .ok()
    .filter(|s| !s.is_empty())
    .ok_or_else(|| WorktreeError::Git {
        message: "cannot squash the first commit of the repository".to_string(),
    })?;
    git(p, &["reset", "--soft", &parent])?;
    match git(p, &["commit", "-m", &message]) {
        Ok(_) => head_of(p, range),
        Err(err) => {
            git(p, &["reset", "--soft", &head])?;
            Err(err)
        }
    }
}

fn require_message(message: &str) -> Result<String, WorktreeError> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(WorktreeError::Git {
            message: "commit message is empty".to_string(),
        });
    }
    Ok(trimmed.to_string())
}

fn resolve_commit(cwd: &Path, sha: &str) -> Result<String, WorktreeError> {
    let trimmed = sha.trim();
    if trimmed.is_empty() {
        return Err(WorktreeError::Git {
            message: "commit sha is empty".to_string(),
        });
    }
    let resolved = git(
        cwd,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{trimmed}^{{commit}}"),
        ],
    )
    .map(|out| out.trim().to_string())
    .ok()
    .filter(|s| !s.is_empty());
    resolved.ok_or_else(|| WorktreeError::Git {
        message: format!("unknown commit: {trimmed}"),
    })
}

fn unpushed_shas(cwd: &Path) -> std::collections::HashSet<String> {
    match resolve_upstream(cwd) {
        Some(upstream) => rev_list_set(cwd, &format!("{upstream}..HEAD")),
        None => rev_list_set(cwd, "HEAD"),
    }
}

fn ensure_unpushed(cwd: &Path, shas: &[String]) -> Result<(), WorktreeError> {
    let unpushed = unpushed_shas(cwd);
    for sha in shas {
        if !unpushed.contains(sha) {
            return Err(WorktreeError::Git {
                message: format!(
                    "{} is already pushed: rewriting it would need a force push",
                    short_of(sha)
                ),
            });
        }
    }
    Ok(())
}

fn ensure_nothing_staged(cwd: &Path) -> Result<(), WorktreeError> {
    let staged = match read_working_tree(cwd) {
        GitWorkingTree::Known { staged, .. } => staged,
        GitWorkingTree::Unknown { .. } => {
            return Err(WorktreeError::Git {
                message: "cannot verify staged changes because git status failed".to_string(),
            });
        }
    };
    if staged > 0 {
        return Err(WorktreeError::Git {
            message: format!(
                "{staged} staged change(s): commit or unstage them before rewriting local history"
            ),
        });
    }
    Ok(())
}

fn head_of(cwd: &Path, replaced: Vec<String>) -> Result<RewrittenHead, WorktreeError> {
    let sha = resolve_commit(cwd, "HEAD")?;
    Ok(RewrittenHead {
        short_sha: short_of(&sha),
        sha,
        replaced,
    })
}

fn short_of(sha: &str) -> String {
    sha.chars().take(7).collect()
}

#[tauri::command]
pub async fn worktree_diff_commit(
    worktree_path: String,
    sha: String,
) -> Result<String, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || worktree_diff_commit_blocking(worktree_path, sha))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_diff_commit_blocking(
    worktree_path: String,
    sha: String,
) -> Result<String, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    let trimmed = sha.trim();
    if trimmed.is_empty() {
        return Err(WorktreeError::Git {
            message: "commit sha is empty".to_string(),
        });
    }
    git(p, &["show", "--format=", trimmed])
}

#[tauri::command]
pub async fn worktree_diff_working(
    worktree_path: String,
    scope: String,
) -> Result<String, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || {
        worktree_diff_working_blocking(worktree_path, scope)
    })
    .await
    .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_diff_working_blocking(
    worktree_path: String,
    scope: String,
) -> Result<String, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    match scope.as_str() {
        "unstaged" => git(p, &["diff"]),
        "staged" => git(p, &["diff", "--cached"]),
        "all" => {
            let tracked = git(p, &["diff", "HEAD"])?;
            Ok(format!("{tracked}{}", untracked_new_file_diffs(p)))
        }
        other => Err(WorktreeError::Git {
            message: format!("unknown scope: {other} (expected unstaged|staged|all)"),
        }),
    }
}

#[tauri::command]
pub async fn worktree_status(
    worktree_path: String,
    base_branch: Option<String>,
) -> Result<WorktreeStatus, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || {
        worktree_status_blocking(worktree_path, base_branch)
    })
    .await
    .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn worktree_status_blocking(
    worktree_path: String,
    base_branch: Option<String>,
) -> Result<WorktreeStatus, WorktreeError> {
    let p = Path::new(&worktree_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(worktree_path));
    }
    let snapshot = git(p, &["status", "--porcelain=v2", "--branch"])
        .ok()
        .map(|raw| parse_status_v2(&raw));
    let branch = snapshot.as_ref().and_then(|s| s.branch.clone());
    let head = snapshot.as_ref().and_then(|s| s.head.clone());
    let upstream = snapshot.as_ref().and_then(|s| s.upstream.clone());
    let head_subject = git(p, &["log", "-1", "--format=%s"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let upstream_distance = match snapshot.as_ref() {
        None => GitDistance::Unknown {
            reason: GitUnknownReason::StatusReadFailed,
        },
        Some(_) if branch.is_none() => GitDistance::Unknown {
            reason: GitUnknownReason::DetachedHead,
        },
        Some(_) if upstream.is_none() => GitDistance::Unknown {
            reason: GitUnknownReason::NoUpstream,
        },
        Some(found) => match found.upstream_ab {
            Some((ahead, behind)) => GitDistance::Known { ahead, behind },
            None => GitDistance::Unknown {
                reason: GitUnknownReason::RevListFailed,
            },
        },
    };
    let working_tree = snapshot
        .map(|s| s.working_tree)
        .unwrap_or(GitWorkingTree::Unknown {
            reason: GitUnknownReason::StatusReadFailed,
        });
    let configured_base = normalized_base(base_branch.as_deref());
    Ok(WorktreeStatus {
        branch,
        head,
        head_subject,
        upstream_distance,
        main_distance: base_distance(p, configured_base),
        working_tree,
        upstream,
        in_progress: in_progress_operation(p),
    })
}

#[derive(Debug, PartialEq, Eq)]
struct StatusSnapshot {
    branch: Option<String>,
    head: Option<String>,
    upstream: Option<String>,
    upstream_ab: Option<(u32, u32)>,
    working_tree: GitWorkingTree,
}

fn parse_ab(value: &str) -> Option<(u32, u32)> {
    let mut ahead = None;
    let mut behind = None;
    for part in value.split_whitespace() {
        if let Some(count) = part.strip_prefix('+') {
            ahead = count.parse::<u32>().ok();
        } else if let Some(count) = part.strip_prefix('-') {
            behind = count.parse::<u32>().ok();
        }
    }
    Some((ahead?, behind?))
}

fn parse_status_v2(raw: &str) -> StatusSnapshot {
    let mut branch = None;
    let mut head = None;
    let mut upstream = None;
    let mut upstream_ab = None;
    let mut staged = 0u32;
    let mut unstaged = 0u32;
    let mut untracked = 0u32;
    let mut unmerged = 0u32;
    let mut changed = 0u32;
    for line in raw.lines() {
        if let Some(header) = line.strip_prefix("# ") {
            let (key, value) = header.split_once(' ').unwrap_or((header, ""));
            match key {
                "branch.oid" if value != "(initial)" => head = Some(value.to_string()),
                "branch.head" if value != "(detached)" => branch = Some(value.to_string()),
                "branch.upstream" => upstream = Some(value.to_string()),
                "branch.ab" => upstream_ab = parse_ab(value),
                _ => {}
            }
            continue;
        }
        let mut fields = line.split(' ');
        let Some(kind) = fields.next() else {
            continue;
        };
        match kind {
            "1" | "2" => {
                changed += 1;
                let xy = fields.next().unwrap_or("..").as_bytes();
                if xy.first().is_some_and(|x| *x != b'.') {
                    staged += 1;
                }
                if xy.get(1).is_some_and(|y| *y != b'.') {
                    unstaged += 1;
                }
            }
            "u" => {
                changed += 1;
                unmerged += 1;
            }
            "?" => {
                changed += 1;
                untracked += 1;
            }
            _ => {}
        }
    }
    StatusSnapshot {
        branch,
        head,
        upstream,
        upstream_ab,
        working_tree: GitWorkingTree::Known {
            staged,
            unstaged,
            untracked,
            unmerged,
            changed,
        },
    }
}

fn base_distance(cwd: &Path, configured_base: Option<&str>) -> GitDistance {
    for base_ref in base_candidates(cwd, configured_base) {
        if let Some((ahead, behind)) = rev_list_left_right(cwd, &base_ref, "HEAD") {
            return GitDistance::Known { ahead, behind };
        }
    }
    GitDistance::Unknown {
        reason: GitUnknownReason::MainRefUnresolved,
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct FastForwardResult {
    pub branch: String,
    pub upstream: String,
    #[serde(rename = "commitsPulled")]
    pub commits_pulled: u32,
}

const FF_SAFETY_FLAGS: [&str; 6] = [
    "-c",
    "pull.rebase=false",
    "-c",
    "rebase.autoStash=false",
    "-c",
    "merge.autoStash=false",
];

fn ff_merge_args(upstream: &str) -> Vec<&str> {
    let mut args: Vec<&str> = FF_SAFETY_FLAGS.to_vec();
    args.extend_from_slice(&["merge", "--ff-only", upstream]);
    args
}

#[tauri::command]
pub async fn checkout_fast_forward(
    checkout_path: String,
) -> Result<FastForwardResult, WorktreeError> {
    tauri::async_runtime::spawn_blocking(move || checkout_fast_forward_blocking(checkout_path))
        .await
        .map_err(|e| WorktreeError::Io(std::io::Error::other(e.to_string())))?
}

fn checkout_fast_forward_blocking(
    checkout_path: String,
) -> Result<FastForwardResult, WorktreeError> {
    let p = Path::new(&checkout_path);
    if !p.exists() {
        return Err(WorktreeError::RepoNotFound(checkout_path));
    }
    let Some(branch) = current_branch_name(p) else {
        return Err(WorktreeError::Git {
            message: "this checkout isn't on a branch, so there's no branch to update".to_string(),
        });
    };
    let Some(upstream) = resolve_upstream(p) else {
        return Err(WorktreeError::Git {
            message: format!("{branch} tracks no upstream branch yet"),
        });
    };
    if git(
        p,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/remotes/{upstream}"),
        ],
    )
    .is_err()
    {
        return Err(WorktreeError::Git {
            message: format!("git doesn't recognize {upstream} as a branch on the remote"),
        });
    }
    if let Some(operation) = in_progress_operation(p) {
        return Err(WorktreeError::Git {
            message: format!(
                "finish the {} in progress first",
                operation_label(operation)
            ),
        });
    }
    match read_working_tree(p) {
        GitWorkingTree::Unknown { .. } => {
            return Err(WorktreeError::Git {
                message: "git status could not be read, so this checkout cannot be updated safely"
                    .to_string(),
            });
        }
        GitWorkingTree::Known { changed, .. } if changed > 0 => {
            return Err(WorktreeError::Git {
                message: "this checkout has uncommitted changes. commit or stash them first"
                    .to_string(),
            });
        }
        GitWorkingTree::Known { .. } => {}
    }
    let Some((remote, _)) = upstream.split_once('/') else {
        return Err(WorktreeError::Git {
            message: format!("cannot tell which remote {upstream} belongs to"),
        });
    };
    git(p, &["fetch", "--no-tags", remote])?;
    let behind = match distance_between(p, &upstream, "HEAD") {
        GitDistance::Known { behind, .. } => behind,
        GitDistance::Unknown { .. } => {
            return Err(WorktreeError::Git {
                message: format!("cannot tell how far {branch} is behind {upstream}"),
            });
        }
    };
    git(p, &ff_merge_args(&upstream))?;
    Ok(FastForwardResult {
        branch,
        upstream,
        commits_pulled: behind,
    })
}

fn operation_label(operation: GitOperation) -> &'static str {
    match operation {
        GitOperation::Merge => "merge",
        GitOperation::Rebase => "rebase",
        GitOperation::CherryPick => "cherry-pick",
        GitOperation::Bisect => "bisect",
    }
}

fn resolve_branch_range(cwd: &Path) -> String {
    resolve_base(cwd, None)
        .map(|(_, merge_base)| format!("{merge_base}..HEAD"))
        .unwrap_or_else(|| "HEAD".to_string())
}

fn normalized_base(base: Option<&str>) -> Option<&str> {
    base.map(str::trim)
        .filter(|candidate| !candidate.is_empty())
}

fn resolve_origin_head(cwd: &Path) -> Option<String> {
    git(cwd, &["symbolic-ref", "refs/remotes/origin/HEAD"])
        .ok()
        .map(|output| output.trim().to_string())
        .and_then(|reference| {
            reference
                .strip_prefix("refs/remotes/origin/")
                .map(str::to_string)
        })
        .filter(|branch| !branch.is_empty())
}

fn base_candidates(cwd: &Path, configured_base: Option<&str>) -> Vec<String> {
    if let Some(base) = configured_base {
        return vec![format!("origin/{base}"), base.to_string()];
    }
    let mut candidates = Vec::new();
    if let Some(base) = resolve_origin_head(cwd) {
        candidates.push(format!("origin/{base}"));
        candidates.push(base);
    }
    for fallback in ["origin/main", "origin/master", "main", "master"] {
        if candidates.iter().all(|candidate| candidate != fallback) {
            candidates.push(fallback.to_string());
        }
    }
    candidates
}

pub(crate) fn resolve_base(cwd: &Path, configured_base: Option<&str>) -> Option<(String, String)> {
    for base_ref in base_candidates(cwd, configured_base) {
        let merge_base = git(cwd, &["merge-base", "HEAD", &base_ref])
            .ok()
            .map(|out| out.trim().to_string())
            .filter(|sha| !sha.is_empty());
        if let Some(merge_base) = merge_base {
            return Some((base_ref, merge_base));
        }
    }
    None
}

pub(crate) fn current_branch_name(cwd: &Path) -> Option<String> {
    git(cwd, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|found| found.trim().to_string())
        .filter(|found| !found.is_empty())
}

pub(crate) fn resolve_upstream(cwd: &Path) -> Option<String> {
    git(
        cwd,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn rev_list_set(cwd: &Path, range: &str) -> std::collections::HashSet<String> {
    git(cwd, &["rev-list", range])
        .ok()
        .map(|s| {
            s.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn rev_list_left_right(cwd: &Path, left: &str, right: &str) -> Option<(u32, u32)> {
    let out = git(
        cwd,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("{left}...{right}"),
        ],
    )
    .ok()?;
    let parts: Vec<&str> = out.split_whitespace().collect();
    if parts.len() < 2 {
        return None;
    }
    let behind = parts[0].parse::<u32>().ok()?;
    let ahead = parts[1].parse::<u32>().ok()?;
    Some((ahead, behind))
}

pub(crate) fn distance_between(cwd: &Path, left: &str, right: &str) -> GitDistance {
    match rev_list_left_right(cwd, left, right) {
        Some((ahead, behind)) => GitDistance::Known { ahead, behind },
        None => GitDistance::Unknown {
            reason: GitUnknownReason::RevListFailed,
        },
    }
}

pub(crate) fn distance_from_upstream(
    cwd: &Path,
    branch: Option<&String>,
    upstream: Option<&String>,
) -> GitDistance {
    if branch.is_none() {
        return GitDistance::Unknown {
            reason: GitUnknownReason::DetachedHead,
        };
    }
    let Some(reference) = upstream else {
        return GitDistance::Unknown {
            reason: GitUnknownReason::NoUpstream,
        };
    };
    distance_between(cwd, reference, "HEAD")
}

pub(crate) fn read_working_tree(cwd: &Path) -> GitWorkingTree {
    let raw = match git(cwd, &["status", "--porcelain=v1"]) {
        Ok(s) => s,
        Err(_) => {
            return GitWorkingTree::Unknown {
                reason: GitUnknownReason::StatusReadFailed,
            };
        }
    };
    parse_working_tree(&raw)
}

fn parse_working_tree(raw: &str) -> GitWorkingTree {
    let mut staged = 0u32;
    let mut unstaged = 0u32;
    let mut untracked = 0u32;
    let mut unmerged = 0u32;
    let mut changed = 0u32;
    for line in raw.lines() {
        let bytes = line.as_bytes();
        if bytes.len() < 2 {
            continue;
        }
        changed += 1;
        let x = bytes[0] as char;
        let y = bytes[1] as char;
        if x == '?' && y == '?' {
            untracked += 1;
            continue;
        }
        if x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D') {
            unmerged += 1;
            continue;
        }
        if x != ' ' && x != '?' {
            staged += 1;
        }
        if y != ' ' && y != '?' {
            unstaged += 1;
        }
    }
    GitWorkingTree::Known {
        staged,
        unstaged,
        untracked,
        unmerged,
        changed,
    }
}

fn git_dir_of(cwd: &Path) -> Option<PathBuf> {
    let dot_git = cwd.join(".git");
    if dot_git.is_dir() {
        return Some(dot_git);
    }
    let pointed = std::fs::read_to_string(&dot_git)
        .ok()
        .and_then(|pointer| Some(pointer.trim().strip_prefix("gitdir:")?.trim().to_string()))
        .map(|target| match Path::new(&target).is_absolute() {
            true => PathBuf::from(target),
            false => cwd.join(target),
        })
        .filter(|resolved| resolved.is_dir());
    if let Some(resolved) = pointed {
        return Some(resolved);
    }
    git(cwd, &["rev-parse", "--absolute-git-dir"])
        .ok()
        .map(|found| PathBuf::from(found.trim()))
}

pub(crate) fn in_progress_operation(cwd: &Path) -> Option<GitOperation> {
    let git_dir = git_dir_of(cwd)?;
    if git_dir.join("MERGE_HEAD").is_file() {
        return Some(GitOperation::Merge);
    }
    if git_dir.join("REBASE_HEAD").is_file()
        || git_dir.join("rebase-merge").is_dir()
        || git_dir.join("rebase-apply").is_dir()
    {
        return Some(GitOperation::Rebase);
    }
    if git_dir.join("CHERRY_PICK_HEAD").is_file() {
        return Some(GitOperation::CherryPick);
    }
    if git_dir.join("BISECT_LOG").is_file() {
        return Some(GitOperation::Bisect);
    }
    None
}

fn git_strs(cwd: &Path, args: &[String]) -> Result<String, WorktreeError> {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    git(cwd, &refs)
}

fn find_existing(
    repo_path: &Path,
    worktree_path: &Path,
) -> Result<Option<WorktreeInfo>, WorktreeError> {
    let stdout = git(repo_path, &["worktree", "list", "--porcelain"])?;
    let entries = parse_porcelain(&stdout);
    Ok(entries
        .into_iter()
        .find(|w| Path::new(&w.path) == worktree_path))
}

/// Best-effort fetch of `origin/<base>`. Silently swallows errors so that
/// offline sessions or repos without an `origin` remote still let the user
/// create a worktree — they just fall back to whatever `origin/<base>` already
/// points at locally (or to the local branch as a last resort).
fn try_fetch_origin(repo_path: &Path, base: &str) {
    let _ = git(repo_path, &["fetch", "origin", base]);
}

/// Resolve the ref to cut a new branch from. Prefers `origin/<base>` so the
/// new branch never inherits commits that exist only on the local copy of the
/// base branch. Falls back to `origin/master` if base is "main" and only
/// `master` exists on the remote, then to the local branch as a last resort.
/// Errors only when none of those refs exist.
fn resolve_origin_base(
    repo_path: &Path,
    configured_base: Option<&str>,
) -> Result<String, WorktreeError> {
    let candidates = base_candidates(repo_path, configured_base);
    for cand in &candidates {
        if git(repo_path, &["rev-parse", "--verify", "--quiet", cand]).is_ok() {
            return Ok(cand.clone());
        }
    }
    Err(WorktreeError::Git {
        message: format!("cannot find base ref: tried {}", candidates.join(", ")),
    })
}

fn untracked_new_file_diffs(p: &Path) -> String {
    let untracked = git(p, &["ls-files", "--others", "--exclude-standard"]).unwrap_or_default();
    let mut out = String::new();
    for line in untracked.lines() {
        let rel = line.trim();
        if rel.is_empty() {
            continue;
        }
        out.push_str(&untracked_new_file_diff_for(p, rel));
    }
    out
}

/// Synthetic new-file unified diff for a single untracked `rel` path. Returns an
/// empty string when the file isn't actually untracked (git lists nothing), so a
/// caller can treat "" as "no diff for this path".
fn untracked_new_file_diff_for(p: &Path, rel: &str) -> String {
    // Only emit if git agrees this path is untracked — keeps the single-file
    // diff honest (a tracked-but-unchanged file produces nothing).
    let listed = git(
        p,
        &["ls-files", "--others", "--exclude-standard", "--", rel],
    )
    .unwrap_or_default();
    if listed.lines().map(str::trim).all(|l| l != rel) {
        return String::new();
    }
    let mut out = String::new();
    out.push_str(&format!("diff --git a/{rel} b/{rel}\n"));
    out.push_str("new file mode 100644\n");
    let bytes = match std::fs::read(p.join(rel)) {
        Ok(b) => b,
        Err(_) => {
            out.push_str("--- /dev/null\n");
            out.push_str(&format!("+++ b/{rel}\n"));
            return out;
        }
    };
    if bytes.contains(&0) {
        out.push_str(&format!("Binary files /dev/null and b/{rel} differ\n"));
        return out;
    }
    let content = match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => {
            out.push_str(&format!("Binary files /dev/null and b/{rel} differ\n"));
            return out;
        }
    };
    out.push_str("--- /dev/null\n");
    out.push_str(&format!("+++ b/{rel}\n"));
    if content.is_empty() {
        return out;
    }
    let ends_with_nl = content.ends_with('\n');
    let lines: Vec<&str> = if ends_with_nl {
        content.split_terminator('\n').collect()
    } else {
        content.split('\n').collect()
    };
    let n = lines.len();
    out.push_str(&format!("@@ -0,0 +1,{n} @@\n"));
    for (i, l) in lines.iter().enumerate() {
        out.push_str(&format!("+{l}\n"));
        if !ends_with_nl && i == n - 1 {
            out.push_str("\\ No newline at end of file\n");
        }
    }
    out
}

static CREDENTIAL_IN_URL: OnceLock<Regex> = OnceLock::new();

pub(crate) fn redact_credentials(raw: &str) -> String {
    let pattern = CREDENTIAL_IN_URL.get_or_init(|| {
        Regex::new(r"([A-Za-z][A-Za-z0-9+.\-]*://)[^/@\s]+@").expect("credential pattern compiles")
    });
    pattern.replace_all(raw, "$1***@").into_owned()
}

#[cfg(test)]
pub(crate) mod git_argv_log {
    use std::cell::RefCell;

    thread_local! {
        static RECORDED: RefCell<Vec<Vec<String>>> = const { RefCell::new(Vec::new()) };
    }

    pub(crate) fn record(args: &[&str]) {
        RECORDED.with(|log| {
            log.borrow_mut()
                .push(args.iter().map(|arg| (*arg).to_string()).collect())
        });
    }

    pub(crate) fn reset() {
        RECORDED.with(|log| log.borrow_mut().clear());
    }

    pub(crate) fn recorded() -> Vec<Vec<String>> {
        RECORDED.with(|log| log.borrow().clone())
    }
}

pub(crate) fn git(cwd: &Path, args: &[&str]) -> Result<String, WorktreeError> {
    #[cfg(test)]
    git_argv_log::record(args);

    let output = crate::path_env::command("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "")
        .env("GIT_SSH_COMMAND", "ssh -oBatchMode=yes")
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8(output.stderr).unwrap_or_default();
        let redacted = redact_credentials(&stderr);
        return Err(WorktreeError::Git {
            message: format!("git {} failed: {redacted}", args.join(" "))
                .trim()
                .to_string(),
        });
    }
    String::from_utf8(output.stdout).map_err(|_| WorktreeError::InvalidUtf8)
}

fn parse_porcelain(stdout: &str) -> Vec<WorktreeInfo> {
    let mut entries = Vec::new();
    let mut is_first = true;

    for block in stdout.split("\n\n") {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }

        let mut path = String::new();
        let mut branch: Option<String> = None;
        let mut head = String::new();

        for line in block.lines() {
            if let Some(rest) = line.strip_prefix("worktree ") {
                path = rest.to_string();
            } else if let Some(rest) = line.strip_prefix("HEAD ") {
                head = rest.to_string();
            } else if let Some(rest) = line.strip_prefix("branch ") {
                branch = Some(rest.trim_start_matches("refs/heads/").to_string());
            } else if line == "detached" {
                branch = None;
            }
        }

        if !path.is_empty() {
            entries.push(WorktreeInfo {
                path,
                branch,
                head,
                is_main: is_first,
            });
            is_first = false;
        }
    }

    entries
}

fn parse_registered_worktrees(stdout: &str) -> Vec<RegisteredWorktree> {
    let mut entries = Vec::new();
    let mut is_main = true;
    for block in stdout.split("\n\n") {
        let mut path = None;
        let mut is_locked = false;
        let mut lock_reason = None;
        for line in block.lines() {
            if let Some(found) = line.strip_prefix("worktree ") {
                path = Some(found.to_string());
                continue;
            }
            if line == "locked" {
                is_locked = true;
                continue;
            }
            if let Some(found) = line.strip_prefix("locked ") {
                is_locked = true;
                lock_reason = Some(found.to_string());
            }
        }
        let Some(path) = path else {
            continue;
        };
        entries.push(RegisteredWorktree {
            path,
            is_main,
            is_locked,
            lock_reason,
        });
        is_main = false;
    }
    entries
}

#[cfg(test)]
mod rewrite_tests {
    use super::{
        worktree_amend_commit_blocking, worktree_create_blocking, worktree_remove_checked_blocking,
        worktree_squash_commits_blocking, worktree_status_blocking, CreateArgs, GitDistance,
        GitUnknownReason, GitWorkingTree, RewriteArgs,
    };
    use std::path::{Path, PathBuf};

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "goodboy-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn git_ok(cwd: &Path, args: &[&str]) -> String {
        super::git(cwd, args)
            .unwrap_or_else(|err| panic!("git {} failed: {err}", args.join(" ")))
            .trim()
            .to_string()
    }

    fn init_repo(name: &str) -> PathBuf {
        let root = temp_root(name);
        git_ok(&root, &["init", "-b", "main"]);
        git_ok(&root, &["config", "user.email", "test@example.com"]);
        git_ok(&root, &["config", "user.name", "test"]);
        git_ok(&root, &["config", "commit.gpgsign", "false"]);
        root
    }

    fn commit(root: &Path, file: &str, body: &str, message: &str) -> String {
        std::fs::write(root.join(file), body).unwrap();
        git_ok(root, &["add", file]);
        git_ok(root, &["commit", "-m", message]);
        git_ok(root, &["rev-parse", "HEAD"])
    }

    fn push_to_new_remote(root: &Path) {
        let remote = root.join("remote.git");
        git_ok(root, &["init", "--bare", remote.to_str().unwrap()]);
        git_ok(root, &["remote", "add", "origin", remote.to_str().unwrap()]);
        git_ok(root, &["push", "-u", "origin", "main"]);
    }

    fn log_subjects(root: &Path) -> Vec<String> {
        git_ok(root, &["log", "--format=%s"])
            .lines()
            .map(|l| l.trim().to_string())
            .collect()
    }

    #[test]
    fn branch_names_strip_origin_and_preserve_the_first_occurrence() {
        let raw = "main\nfeature/search\norigin\norigin/HEAD\norigin/main\norigin/release\nupstream/HEAD\nupstream/release\n";

        assert_eq!(
            super::normalize_branch_names(raw),
            vec!["main", "feature/search", "release", "upstream/release"]
        );
    }

    fn args(root: &Path, sha: &str, message: &str) -> RewriteArgs {
        RewriteArgs {
            worktree_path: root.to_string_lossy().into_owned(),
            sha: sha.to_string(),
            message: message.to_string(),
        }
    }

    #[test]
    fn status_counts_commits_ahead_of_and_behind_main() {
        let root = init_repo("status-main-position");
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);
        git_ok(&root, &["checkout", "-b", "feature"]);
        commit(&root, "feature.txt", "feature", "feature");
        commit(&root, "feature-two.txt", "feature two", "feature two");
        git_ok(&root, &["checkout", "main"]);
        commit(&root, "main.txt", "main", "main");
        git_ok(&root, &["push", "origin", "main"]);
        git_ok(&root, &["checkout", "feature"]);

        let status = worktree_status_blocking(root.to_string_lossy().into_owned(), None).unwrap();

        assert_eq!(
            status.main_distance,
            GitDistance::Known {
                ahead: 2,
                behind: 1
            }
        );
    }

    #[test]
    fn porcelain_v2_headers_and_entries_become_one_snapshot() {
        let raw = "# branch.oid 0123abcd\n# branch.head feature\n# branch.upstream origin/feature\n# branch.ab +2 -1\n1 M. N... 100644 100644 100644 aaaa bbbb staged.txt\n1 .M N... 100644 100644 100644 aaaa bbbb unstaged.txt\n1 MM N... 100644 100644 100644 aaaa bbbb both.txt\n2 R. N... 100644 100644 100644 aaaa bbbb R100 renamed.txt\told.txt\nu UU N... 100644 100644 100644 100644 aaaa bbbb cccc conflict.txt\n? new.txt\n! ignored.txt\n";

        assert_eq!(
            super::parse_status_v2(raw),
            super::StatusSnapshot {
                branch: Some("feature".to_string()),
                head: Some("0123abcd".to_string()),
                upstream: Some("origin/feature".to_string()),
                upstream_ab: Some((2, 1)),
                working_tree: GitWorkingTree::Known {
                    staged: 3,
                    unstaged: 2,
                    untracked: 1,
                    unmerged: 1,
                    changed: 6
                },
            }
        );
    }

    #[test]
    fn porcelain_v2_detached_and_initial_heads_read_as_absent() {
        let raw = "# branch.oid (initial)\n# branch.head (detached)\n";
        let snapshot = super::parse_status_v2(raw);

        assert_eq!(snapshot.branch, None);
        assert_eq!(snapshot.head, None);
        assert_eq!(snapshot.upstream, None);
        assert_eq!(snapshot.upstream_ab, None);
    }

    #[test]
    fn status_reads_a_configured_base_with_three_git_spawns() {
        let root = init_repo("status-spawn-budget");
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);
        git_ok(&root, &["checkout", "-b", "feature"]);
        commit(&root, "feature.txt", "feature", "feature");
        git_ok(&root, &["push", "-u", "origin", "feature"]);
        std::fs::write(root.join("dirty.txt"), "dirty").unwrap();

        super::git_argv_log::reset();
        let status =
            worktree_status_blocking(root.to_string_lossy().into_owned(), Some("main".into()))
                .unwrap();
        let spawned = super::git_argv_log::recorded();

        assert_eq!(spawned.len(), 3, "git argv: {spawned:?}");
        assert_eq!(status.branch.as_deref(), Some("feature"));
        assert!(status.head.is_some());
        assert_eq!(status.head_subject.as_deref(), Some("feature"));
        assert_eq!(status.upstream.as_deref(), Some("origin/feature"));
        assert_eq!(
            status.upstream_distance,
            GitDistance::Known {
                ahead: 0,
                behind: 0
            }
        );
        assert_eq!(
            status.main_distance,
            GitDistance::Known {
                ahead: 1,
                behind: 0
            }
        );
        assert_eq!(
            status.working_tree,
            GitWorkingTree::Known {
                staged: 0,
                unstaged: 0,
                untracked: 2,
                unmerged: 0,
                changed: 2
            },
            "dirty.txt plus the bare remote.git the harness leaves inside the repo"
        );
        assert_eq!(status.in_progress, None);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_failed_status_read_reports_status_read_failed_for_the_upstream_distance() {
        let root = temp_root("status-read-failure");

        let status = worktree_status_blocking(root.to_string_lossy().into_owned(), None).unwrap();

        assert_eq!(
            status.upstream_distance,
            GitDistance::Unknown {
                reason: GitUnknownReason::StatusReadFailed
            }
        );
        assert_eq!(
            status.working_tree,
            GitWorkingTree::Unknown {
                reason: GitUnknownReason::StatusReadFailed
            }
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_malformed_dot_git_file_falls_back_to_rev_parse() {
        let broken = temp_root("git-dir-malformed");
        std::fs::write(broken.join(".git"), "garbage").unwrap();

        assert_eq!(super::git_dir_of(&broken), None);
        std::fs::remove_dir_all(&broken).unwrap();

        let root = init_repo("git-dir-resolution");
        commit(&root, "base.txt", "base", "base");

        assert_eq!(super::git_dir_of(&root), Some(root.join(".git")));

        let linked = root.join("wt");
        git_ok(
            &root,
            &["worktree", "add", linked.to_str().unwrap(), "-b", "wt"],
        );
        let linked_dir = super::git_dir_of(&linked).unwrap();

        assert!(linked_dir.join("HEAD").is_file());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn status_reports_a_detached_head_and_a_missing_upstream() {
        let root = init_repo("status-detached");
        commit(&root, "base.txt", "base", "base");
        let status = worktree_status_blocking(root.to_string_lossy().into_owned(), None).unwrap();
        assert_eq!(
            status.upstream_distance,
            GitDistance::Unknown {
                reason: GitUnknownReason::NoUpstream
            }
        );

        git_ok(&root, &["checkout", "--detach"]);
        let detached = worktree_status_blocking(root.to_string_lossy().into_owned(), None).unwrap();

        assert_eq!(detached.branch, None);
        assert_eq!(
            detached.upstream_distance,
            GitDistance::Unknown {
                reason: GitUnknownReason::DetachedHead
            }
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_failed_rev_list_is_reported_as_unknown_rather_than_in_sync() {
        let root = init_repo("fail-closed-rev-list");
        commit(&root, "base.txt", "base", "base");

        assert_eq!(
            super::rev_list_left_right(&root, "missing-ref", "HEAD"),
            None
        );
        assert_eq!(
            super::distance_between(&root, "missing-ref", "HEAD"),
            GitDistance::Unknown {
                reason: GitUnknownReason::RevListFailed
            }
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn an_unresolvable_main_ref_is_reported_as_unknown_rather_than_zero_distance() {
        let root = temp_root("fail-closed-resolve-main");
        git_ok(&root, &["init", "-b", "trunk"]);
        git_ok(&root, &["config", "user.email", "test@example.com"]);
        git_ok(&root, &["config", "user.name", "test"]);
        git_ok(&root, &["config", "commit.gpgsign", "false"]);
        commit(&root, "base.txt", "base", "base");

        let status = worktree_status_blocking(root.to_string_lossy().into_owned(), None).unwrap();

        assert_eq!(super::resolve_base(&root, None), None);
        assert_eq!(
            status.main_distance,
            GitDistance::Unknown {
                reason: GitUnknownReason::MainRefUnresolved
            }
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_failed_status_read_is_reported_as_unknown_rather_than_a_clean_tree() {
        let root = temp_root("fail-closed-status-read");

        assert_eq!(
            super::read_working_tree(&root),
            GitWorkingTree::Unknown {
                reason: GitUnknownReason::StatusReadFailed
            }
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_merge_conflict_is_counted_as_unmerged_and_never_as_staged_or_unstaged() {
        let root = init_repo("fail-closed-conflict");
        commit(&root, "shared.txt", "base\n", "base");
        git_ok(&root, &["checkout", "-b", "feature"]);
        commit(&root, "shared.txt", "feature\n", "feature");
        git_ok(&root, &["checkout", "main"]);
        commit(&root, "shared.txt", "main\n", "main");
        let merge = super::git(&root, &["merge", "feature"]);

        assert!(merge.is_err());
        assert_eq!(
            super::read_working_tree(&root),
            GitWorkingTree::Known {
                staged: 0,
                unstaged: 0,
                untracked: 0,
                unmerged: 1,
                changed: 1
            }
        );
        assert_eq!(
            super::in_progress_operation(&root),
            Some(super::GitOperation::Merge)
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resolves_master_when_the_repository_has_no_main_branch() {
        let root = temp_root("resolve-main-master");
        git_ok(&root, &["init", "-b", "master"]);
        git_ok(&root, &["config", "user.email", "test@example.com"]);
        git_ok(&root, &["config", "user.name", "test"]);
        git_ok(&root, &["config", "commit.gpgsign", "false"]);
        let base = commit(&root, "base.txt", "base", "base");
        git_ok(&root, &["checkout", "-b", "feature"]);
        commit(&root, "feature.txt", "feature", "feature");

        let (main_ref, merge_base) =
            super::resolve_base(&root, None).expect("master resolves as main");

        assert_eq!(main_ref, "master");
        assert_eq!(merge_base, base);
        assert_eq!(
            worktree_status_blocking(root.to_string_lossy().into_owned(), None)
                .unwrap()
                .main_distance,
            GitDistance::Known {
                ahead: 1,
                behind: 0
            }
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fast_forward_advances_the_branch_to_its_upstream() {
        let root = init_repo("fast-forward-clean");
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);
        let clone_root = temp_root("fast-forward-clone");
        git_ok(
            &clone_root,
            &[
                "clone",
                root.join("remote.git").to_str().unwrap(),
                clone_root.join("copy").to_str().unwrap(),
            ],
        );
        let copy = clone_root.join("copy");
        git_ok(&copy, &["checkout", "-B", "main", "--track", "origin/main"]);
        commit(&root, "next.txt", "next", "next");
        git_ok(&root, &["push", "origin", "main"]);

        super::git_argv_log::reset();
        let pulled =
            super::checkout_fast_forward_blocking(copy.to_string_lossy().into_owned()).unwrap();
        let merge_invocations: Vec<Vec<String>> = super::git_argv_log::recorded()
            .into_iter()
            .filter(|argv| argv.iter().any(|arg| arg == "merge"))
            .collect();

        assert_eq!(pulled.upstream, "origin/main");
        assert_eq!(pulled.commits_pulled, 1);
        assert!(copy.join("next.txt").is_file());
        assert_eq!(
            merge_invocations,
            vec![vec![
                "-c".to_string(),
                "pull.rebase=false".to_string(),
                "-c".to_string(),
                "rebase.autoStash=false".to_string(),
                "-c".to_string(),
                "merge.autoStash=false".to_string(),
                "merge".to_string(),
                "--ff-only".to_string(),
                "origin/main".to_string(),
            ]]
        );
        std::fs::remove_dir_all(root).unwrap();
        std::fs::remove_dir_all(clone_root).unwrap();
    }

    #[test]
    fn fast_forward_refuses_a_dirty_checkout_and_leaves_it_untouched() {
        let root = init_repo("fast-forward-dirty");
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);
        std::fs::write(root.join("scratch.txt"), "work in progress").unwrap();
        let before = git_ok(&root, &["rev-parse", "HEAD"]);

        let refusal =
            super::checkout_fast_forward_blocking(root.to_string_lossy().into_owned()).unwrap_err();

        assert!(format!("{refusal}").contains("uncommitted changes"));
        assert_eq!(git_ok(&root, &["rev-parse", "HEAD"]), before);
        assert_eq!(
            std::fs::read_to_string(root.join("scratch.txt")).unwrap(),
            "work in progress"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fast_forward_refuses_a_branch_without_an_upstream() {
        let root = init_repo("fast-forward-no-upstream");
        commit(&root, "base.txt", "base", "base");

        let refusal =
            super::checkout_fast_forward_blocking(root.to_string_lossy().into_owned()).unwrap_err();

        assert!(format!("{refusal}").contains("no upstream"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fast_forward_refuses_while_a_merge_is_in_progress() {
        let root = init_repo("fast-forward-mid-merge");
        commit(&root, "shared.txt", "base\n", "base");
        push_to_new_remote(&root);
        git_ok(&root, &["checkout", "-b", "feature"]);
        commit(&root, "shared.txt", "feature\n", "feature");
        git_ok(&root, &["checkout", "main"]);
        commit(&root, "shared.txt", "main\n", "main");
        let merge = super::git(&root, &["merge", "feature"]);

        let refusal =
            super::checkout_fast_forward_blocking(root.to_string_lossy().into_owned()).unwrap_err();

        assert!(merge.is_err());
        assert!(format!("{refusal}").contains("merge in progress"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fast_forward_refuses_when_the_working_tree_cannot_be_read() {
        let root = init_repo("fast-forward-unreadable-status");
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);
        let before = git_ok(&root, &["rev-parse", "HEAD"]);
        std::fs::write(root.join(".git").join("index"), "not an index").unwrap();

        let refusal =
            super::checkout_fast_forward_blocking(root.to_string_lossy().into_owned()).unwrap_err();

        assert!(format!("{refusal}").contains("git status could not be read"));
        assert_eq!(git_ok(&root, &["rev-parse", "HEAD"]), before);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ff_merge_args_builds_the_flags_that_forbid_a_rebase_or_an_autostash() {
        assert_eq!(
            super::ff_merge_args("origin/main"),
            vec![
                "-c",
                "pull.rebase=false",
                "-c",
                "rebase.autoStash=false",
                "-c",
                "merge.autoStash=false",
                "merge",
                "--ff-only",
                "origin/main",
            ]
        );
    }

    #[test]
    fn a_remote_url_carrying_a_token_is_redacted_before_it_reaches_the_user() {
        let leaky = "fatal: unable to access 'https://someone:ghp_secretvalue@github.com/acme/widgets.git/': the remote hung up";

        let safe = super::redact_credentials(leaky);

        assert!(!safe.contains("ghp_secretvalue"));
        assert!(!safe.contains("someone"));
        assert!(safe.contains("https://***@github.com/acme/widgets.git/"));
        assert_eq!(
            super::redact_credentials(
                "fatal: repository 'https://github.com/acme/widgets' not found"
            ),
            "fatal: repository 'https://github.com/acme/widgets' not found"
        );
    }

    #[test]
    fn refuses_to_create_a_worktree_before_the_repository_exists() {
        let root = temp_root("create-without-git");

        let plain = worktree_create_blocking(CreateArgs {
            repo_path: root.to_string_lossy().into_owned(),
            branch_prefix: "ak".to_string(),
            slug: "first".to_string(),
            existing_branch: None,
            fallback_ref: None,
            base_branch: None,
            parent_dir: None,
            dir_name: None,
        })
        .unwrap_err();

        assert!(matches!(plain, super::WorktreeError::NoRepository(_)));
        assert!(!root.join(".gitignore").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_to_create_a_worktree_before_the_first_commit() {
        let root = init_repo("create-without-commit");

        let unborn = worktree_create_blocking(CreateArgs {
            repo_path: root.to_string_lossy().into_owned(),
            branch_prefix: "ak".to_string(),
            slug: "first".to_string(),
            existing_branch: None,
            fallback_ref: None,
            base_branch: None,
            parent_dir: None,
            dir_name: None,
        })
        .unwrap_err();

        assert!(matches!(unborn, super::WorktreeError::NoCommit(_)));
        assert!(!root.join(".gitignore").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn amend_rewords_the_newest_local_commit_without_upstream() {
        let root = init_repo("amend-local");
        commit(&root, "a.txt", "a", "first");
        let head = commit(&root, "b.txt", "b", "second");

        let result =
            worktree_amend_commit_blocking(args(&root, &head, "second, reworded")).unwrap();

        assert_eq!(result.sha, git_ok(&root, &["rev-parse", "HEAD"]));
        assert_eq!(result.replaced, vec![head]);
        assert_eq!(log_subjects(&root), vec!["second, reworded", "first"]);
    }

    #[test]
    fn amend_refuses_a_pushed_commit() {
        let root = init_repo("amend-pushed");
        commit(&root, "a.txt", "a", "first");
        push_to_new_remote(&root);
        let head = git_ok(&root, &["rev-parse", "HEAD"]);

        let err = worktree_amend_commit_blocking(args(&root, &head, "reworded")).unwrap_err();

        assert!(err.to_string().contains("already pushed"), "{err}");
        assert_eq!(git_ok(&root, &["rev-parse", "HEAD"]), head);
    }

    #[test]
    fn amend_refuses_a_commit_behind_head() {
        let root = init_repo("amend-behind");
        let first = commit(&root, "a.txt", "a", "first");
        let head = commit(&root, "b.txt", "b", "second");

        let err = worktree_amend_commit_blocking(args(&root, &first, "reworded")).unwrap_err();

        assert!(err.to_string().contains("newest local commit"), "{err}");
        assert_eq!(git_ok(&root, &["rev-parse", "HEAD"]), head);
    }

    #[test]
    fn squash_folds_the_selected_range_into_one_commit() {
        let root = init_repo("squash-range");
        commit(&root, "a.txt", "a", "first");
        let second = commit(&root, "b.txt", "b", "second");
        let third = commit(&root, "c.txt", "c", "third");

        let result =
            worktree_squash_commits_blocking(args(&root, &second, "second and third")).unwrap();

        assert_eq!(result.sha, git_ok(&root, &["rev-parse", "HEAD"]));
        assert_eq!(result.replaced, vec![third, second]);
        assert_eq!(log_subjects(&root), vec!["second and third", "first"]);
        assert_eq!(
            git_ok(&root, &["show", "--name-only", "--format=", "HEAD"]),
            "b.txt\nc.txt"
        );
    }

    #[test]
    fn squash_refuses_a_range_that_contains_a_pushed_commit() {
        let root = init_repo("squash-pushed");
        commit(&root, "a.txt", "a", "first");
        let second = commit(&root, "b.txt", "b", "second");
        push_to_new_remote(&root);
        commit(&root, "c.txt", "c", "third");
        let head = git_ok(&root, &["rev-parse", "HEAD"]);

        let err =
            worktree_squash_commits_blocking(args(&root, &second, "second and third")).unwrap_err();

        assert!(err.to_string().contains("already pushed"), "{err}");
        assert_eq!(git_ok(&root, &["rev-parse", "HEAD"]), head);
    }

    #[test]
    fn squash_refuses_staged_changes() {
        let root = init_repo("squash-staged");
        commit(&root, "a.txt", "a", "first");
        let second = commit(&root, "b.txt", "b", "second");
        commit(&root, "c.txt", "c", "third");
        std::fs::write(root.join("d.txt"), "d").unwrap();
        git_ok(&root, &["add", "d.txt"]);
        let head = git_ok(&root, &["rev-parse", "HEAD"]);

        let err =
            worktree_squash_commits_blocking(args(&root, &second, "second and third")).unwrap_err();

        assert!(err.to_string().contains("staged change"), "{err}");
        assert_eq!(git_ok(&root, &["rev-parse", "HEAD"]), head);
    }

    #[test]
    fn squash_refuses_the_first_commit_of_the_repository() {
        let root = init_repo("squash-root");
        let first = commit(&root, "a.txt", "a", "first");
        commit(&root, "b.txt", "b", "second");
        let head = git_ok(&root, &["rev-parse", "HEAD"]);

        let err = worktree_squash_commits_blocking(args(&root, &first, "everything")).unwrap_err();

        assert!(err.to_string().contains("first commit"), "{err}");
        assert_eq!(git_ok(&root, &["rev-parse", "HEAD"]), head);
    }

    #[test]
    fn a_failed_squash_restores_head_and_leaves_no_rebase_in_progress() {
        let root = init_repo("squash-failure");
        commit(&root, "a.txt", "a", "first");
        let second = commit(&root, "b.txt", "b", "second");
        commit(&root, "c.txt", "c", "third");
        let head = git_ok(&root, &["rev-parse", "HEAD"]);
        let hook = root.join(".git").join("hooks").join("pre-commit");
        std::fs::create_dir_all(hook.parent().unwrap()).unwrap();
        std::fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        let err =
            worktree_squash_commits_blocking(args(&root, &second, "second and third")).unwrap_err();

        assert!(err.to_string().contains("git commit"), "{err}");
        assert_eq!(git_ok(&root, &["rev-parse", "HEAD"]), head);
        assert_eq!(log_subjects(&root), vec!["third", "second", "first"]);
        assert!(!root.join(".git").join("rebase-merge").exists());
        assert!(!root.join(".git").join("rebase-apply").exists());
    }

    fn create_session_mount(root: &Path, slug: &str) -> super::CreatedWorktree {
        let parent = root.join(".goodboy").join("worktrees");
        worktree_create_blocking(CreateArgs {
            repo_path: root.to_string_lossy().into_owned(),
            branch_prefix: "goodboy".to_string(),
            slug: slug.to_string(),
            parent_dir: Some(parent.to_string_lossy().into_owned()),
            existing_branch: None,
            fallback_ref: None,
            base_branch: None,
            dir_name: Some(slug.to_string()),
        })
        .unwrap()
    }

    #[test]
    fn selected_split_keeps_the_parent_worktree_while_resolving_a_cherry_pick() {
        let root = std::fs::canonicalize(init_repo("selected-split")).unwrap();
        commit(&root, "auth.txt", "base\n", "base");
        push_to_new_remote(&root);
        let parent_dir = root.join(".goodboy").join("worktrees");
        let parent = worktree_create_blocking(CreateArgs {
            repo_path: root.to_string_lossy().into_owned(),
            branch_prefix: "feature".to_string(),
            slug: "eng-3240-draft".to_string(),
            parent_dir: Some(parent_dir.to_string_lossy().into_owned()),
            existing_branch: None,
            fallback_ref: None,
            base_branch: Some("main".to_string()),
            dir_name: Some("mount-parent".to_string()),
        })
        .unwrap();
        let parent_path = PathBuf::from(&parent.worktree_path);
        let selected = commit(
            &parent_path,
            "auth.txt",
            "parent auth\n",
            "extract authentication",
        );
        commit(
            &parent_path,
            "parent-only.txt",
            "later work\n",
            "continue parent draft",
        );
        let parent_head = git_ok(&parent_path, &["rev-parse", "HEAD"]);
        let split = worktree_create_blocking(CreateArgs {
            repo_path: root.to_string_lossy().into_owned(),
            branch_prefix: "feature".to_string(),
            slug: "eng-3240-auth".to_string(),
            parent_dir: Some(parent_dir.to_string_lossy().into_owned()),
            existing_branch: None,
            fallback_ref: None,
            base_branch: Some("main".to_string()),
            dir_name: Some("mount-split".to_string()),
        })
        .unwrap();
        let split_path = PathBuf::from(&split.worktree_path);
        commit(
            &split_path,
            "auth.txt",
            "split preparation\n",
            "prepare selected split",
        );

        assert!(super::git(&split_path, &["cherry-pick", &selected]).is_err());
        std::fs::write(
            split_path.join("auth.txt"),
            "split preparation\nparent auth\n",
        )
        .unwrap();
        git_ok(&split_path, &["add", "auth.txt"]);
        git_ok(&split_path, &["cherry-pick", "--continue"]);

        assert_eq!(git_ok(&parent_path, &["rev-parse", "HEAD"]), parent_head);
        assert_eq!(
            (
                parent_path.join("parent-only.txt").exists(),
                split_path.join("parent-only.txt").exists()
            ),
            (true, false)
        );
        assert_eq!(
            (
                git_ok(&parent_path, &["branch", "--show-current"]),
                git_ok(&split_path, &["branch", "--show-current"])
            ),
            (parent.branch_name, split.branch_name)
        );
    }

    #[test]
    fn a_session_mount_lands_under_goodboy_worktrees_and_stays_out_of_status() {
        let root = std::fs::canonicalize(init_repo("exclude-on-create")).unwrap();
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);

        let created = create_session_mount(&root, "goal-abc12345");

        assert_eq!(
            created.worktree_path,
            root.join(".goodboy")
                .join("worktrees")
                .join("goal-abc12345")
                .to_string_lossy()
        );
        let exclude =
            std::fs::read_to_string(root.join(".git").join("info").join("exclude")).unwrap();
        assert_eq!(
            exclude.lines().filter(|line| *line == ".goodboy/").count(),
            1
        );
        let status = git_ok(&root, &["status", "--porcelain"]);
        assert!(!status.contains(".goodboy"), "{status}");
        assert!(!root.join(".gitignore").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn the_exclude_entry_is_written_once_and_survives_a_detach() {
        let root = std::fs::canonicalize(init_repo("exclude-lifecycle")).unwrap();
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);
        let created = create_session_mount(&root, "goal-def67890");

        let reused = create_session_mount(&root, "goal-def67890");
        assert!(reused.reused);
        let exclude_path = root.join(".git").join("info").join("exclude");
        let exclude = std::fs::read_to_string(&exclude_path).unwrap();
        assert_eq!(
            exclude.lines().filter(|line| *line == ".goodboy/").count(),
            1
        );

        worktree_remove_checked_blocking(
            root.to_string_lossy().into_owned(),
            created.worktree_path.clone(),
        )
        .unwrap();

        assert!(!Path::new(&created.worktree_path).exists());
        let after = std::fs::read_to_string(&exclude_path).unwrap();
        assert_eq!(after.lines().filter(|line| *line == ".goodboy/").count(), 1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn deleting_the_last_mount_tidies_the_goodboy_dir_and_the_exclude_entry() {
        let root = std::fs::canonicalize(init_repo("tidy-last-mount")).unwrap();
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);
        let created = create_session_mount(&root, "goal-tidy0001");

        worktree_remove_checked_blocking(
            root.to_string_lossy().into_owned(),
            created.worktree_path.clone(),
        )
        .unwrap();
        super::tidy_goodboy_dir(&root);

        assert!(!root.join(".goodboy").exists());
        let exclude_path = root.join(".git").join("info").join("exclude");
        let exclude = std::fs::read_to_string(&exclude_path).unwrap();
        assert_eq!(
            exclude.lines().filter(|line| *line == ".goodboy/").count(),
            0
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn tidy_keeps_the_goodboy_dir_and_the_exclude_entry_while_another_mount_remains() {
        let root = std::fs::canonicalize(init_repo("tidy-shared-repo")).unwrap();
        commit(&root, "base.txt", "base", "base");
        push_to_new_remote(&root);
        let removed = create_session_mount(&root, "goal-tidy0002");
        let survivor = create_session_mount(&root, "goal-tidy0003");

        worktree_remove_checked_blocking(
            root.to_string_lossy().into_owned(),
            removed.worktree_path.clone(),
        )
        .unwrap();
        super::tidy_goodboy_dir(&root);

        assert!(Path::new(&survivor.worktree_path).is_dir());
        let exclude_path = root.join(".git").join("info").join("exclude");
        let exclude = std::fs::read_to_string(&exclude_path).unwrap();
        assert_eq!(
            exclude.lines().filter(|line| *line == ".goodboy/").count(),
            1
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
mod teardown_tests {
    use super::{
        collect_orphans, inspect_worktree_with, remove_worktree_checked_with,
        worktree_directory_size_blocking, worktree_orphan_remove_blocking, WorktreeError,
        WorktreeInspection, WorktreeRemovalReason, WorktreeRemovalResult,
    };
    use std::path::{Path, PathBuf};

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "goodboy-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn not_empty() -> WorktreeError {
        WorktreeError::Git {
            message:
                "git worktree remove --force /x failed: fatal: could not remove: Directory not empty"
                    .to_string(),
        }
    }

    fn git_ok(cwd: &Path, args: &[&str]) -> String {
        super::git(cwd, args)
            .unwrap_or_else(|error| panic!("git {} failed: {error}", args.join(" ")))
            .trim()
            .to_string()
    }

    fn init_repo(name: &str) -> PathBuf {
        let root = temp_root(name);
        git_ok(&root, &["init", "-b", "main"]);
        git_ok(&root, &["config", "user.email", "test@example.com"]);
        git_ok(&root, &["config", "user.name", "test"]);
        std::fs::write(root.join(".gitignore"), "node_modules/\n").unwrap();
        std::fs::write(root.join("tracked.txt"), "base\n").unwrap();
        git_ok(&root, &["add", ".gitignore", "tracked.txt"]);
        git_ok(&root, &["commit", "-m", "base"]);
        std::fs::canonicalize(root).unwrap()
    }

    fn add_worktree(root: &Path, name: &str) -> PathBuf {
        let target = root.join("worktrees").join(name);
        git_ok(
            root,
            &[
                "worktree",
                "add",
                "-b",
                &format!("test/{name}"),
                target.to_str().unwrap(),
            ],
        );
        std::fs::canonicalize(target).unwrap()
    }

    fn remove(root: &Path, target: &Path) -> WorktreeRemovalResult {
        remove_worktree_checked_with(root, target, &mut |cwd, args| super::git(cwd, args)).unwrap()
    }

    fn kept_reasons(result: WorktreeRemovalResult) -> Vec<WorktreeRemovalReason> {
        let WorktreeRemovalResult::Kept { reasons, .. } = result else {
            panic!("expected kept result, found {result:?}");
        };
        reasons
    }

    #[test]
    fn clean_registered_worktree_with_ignored_dependencies_is_removed() {
        let root = init_repo("remove-clean");
        let target = add_worktree(&root, "clean");
        std::fs::create_dir_all(target.join("node_modules").join("dep")).unwrap();
        std::fs::write(
            target.join("node_modules").join("dep").join("index.js"),
            "x",
        )
        .unwrap();

        let result = remove(&root, &target);

        assert!(matches!(result, WorktreeRemovalResult::Removed { .. }));
        assert!(!target.exists());
    }

    #[test]
    fn dependency_size_is_reported_and_disappears_after_safe_cleanup() {
        let root = init_repo("remove-dependencies");
        let target = add_worktree(&root, "dependencies");
        std::fs::create_dir_all(target.join("node_modules").join("dep")).unwrap();
        std::fs::write(
            target.join("node_modules").join("dep").join("index.js"),
            vec![0u8; 4096],
        )
        .unwrap();

        let before = worktree_directory_size_blocking(target.to_string_lossy().into_owned());
        let removed = remove(&root, &target);
        let after = worktree_directory_size_blocking(target.to_string_lossy().into_owned());

        assert!(before.size_bytes.is_some_and(|bytes| bytes >= 4096));
        assert!(matches!(removed, WorktreeRemovalResult::Removed { .. }));
        assert_eq!((after.exists, after.size_bytes), (false, None));
    }

    #[test]
    fn dirty_worktree_is_kept_with_each_change_reason() {
        let root = init_repo("remove-dirty");
        let target = add_worktree(&root, "dirty");
        std::fs::write(target.join("tracked.txt"), "changed\n").unwrap();
        std::fs::write(target.join("staged.txt"), "staged\n").unwrap();
        git_ok(&target, &["add", "staged.txt"]);
        std::fs::write(target.join("untracked.txt"), "untracked\n").unwrap();

        let reasons = kept_reasons(remove(&root, &target));

        assert!(reasons.contains(&WorktreeRemovalReason::StagedChanges));
        assert!(reasons.contains(&WorktreeRemovalReason::UnstagedChanges));
        assert!(reasons.contains(&WorktreeRemovalReason::UntrackedFiles));
        assert!(target.exists());
    }

    #[test]
    fn conflicted_worktree_and_in_progress_merge_are_kept() {
        let root = init_repo("remove-conflict");
        let target = add_worktree(&root, "conflict");
        std::fs::write(root.join("tracked.txt"), "main\n").unwrap();
        git_ok(&root, &["commit", "-am", "main change"]);
        std::fs::write(target.join("tracked.txt"), "branch\n").unwrap();
        git_ok(&target, &["commit", "-am", "branch change"]);
        assert!(super::git(&target, &["merge", "main"]).is_err());

        let reasons = kept_reasons(remove(&root, &target));

        assert!(reasons.contains(&WorktreeRemovalReason::UnmergedConflicts));
        assert!(reasons.contains(&WorktreeRemovalReason::OperationInProgress));
        assert!(target.exists());
    }

    #[test]
    fn status_failure_is_treated_as_unsafe() {
        let root = init_repo("remove-status-failure");
        let target = add_worktree(&root, "status-failure");
        let git_dir = PathBuf::from(git_ok(&target, &["rev-parse", "--absolute-git-dir"]));
        std::fs::write(git_dir.join("index"), "invalid index").unwrap();

        let reasons = kept_reasons(remove(&root, &target));

        assert_eq!(reasons, vec![WorktreeRemovalReason::StatusUnavailable]);
        assert!(target.exists());
    }

    #[test]
    fn locked_worktree_is_kept() {
        let root = init_repo("remove-locked");
        let target = add_worktree(&root, "locked");
        git_ok(
            &root,
            &[
                "worktree",
                "lock",
                "--reason",
                "busy",
                target.to_str().unwrap(),
            ],
        );

        let reasons = kept_reasons(remove(&root, &target));

        assert_eq!(reasons, vec![WorktreeRemovalReason::Locked]);
        assert!(target.exists());
    }

    #[test]
    fn wrong_repository_and_main_checkout_are_kept() {
        let root = init_repo("remove-owner");
        let other = init_repo("remove-other-owner");
        let target = add_worktree(&root, "owned");

        let wrong_repo = kept_reasons(remove(&other, &target));
        let main_checkout = kept_reasons(remove(&root, &root));

        assert_eq!(wrong_repo, vec![WorktreeRemovalReason::DifferentRepository]);
        assert_eq!(main_checkout, vec![WorktreeRemovalReason::MainCheckout]);
        assert!(target.exists());
    }

    #[test]
    fn missing_path_is_reported_without_removal() {
        let root = init_repo("remove-missing");
        let target = root.join("missing");

        let result = remove(&root, &target);

        assert_eq!(
            result,
            WorktreeRemovalResult::Missing {
                path: target.to_string_lossy().into_owned()
            }
        );
    }

    #[test]
    fn unexpected_directory_is_kept() {
        let root = init_repo("remove-unexpected");
        let target = root.join("unexpected");
        std::fs::create_dir_all(&target).unwrap();

        let reasons = kept_reasons(remove(&root, &target));

        assert_eq!(reasons, vec![WorktreeRemovalReason::UnexpectedDirectory]);
        assert!(target.exists());
    }

    #[test]
    fn fallback_removes_only_the_revalidated_registered_target() {
        let root = init_repo("remove-fallback");
        let target = add_worktree(&root, "fallback");
        let neighbor = root.join("worktrees").join("keep-me");
        std::fs::create_dir_all(target.join("node_modules").join("dep")).unwrap();
        std::fs::write(
            target.join("node_modules").join("dep").join("index.js"),
            "x",
        )
        .unwrap();
        std::fs::create_dir_all(&neighbor).unwrap();
        let mut remove_attempts = 0;

        let result = remove_worktree_checked_with(&root, &target, &mut |cwd, args| {
            if args.starts_with(&["worktree", "remove"]) {
                remove_attempts += 1;
                return Err(not_empty());
            }
            super::git(cwd, args)
        })
        .unwrap();

        assert!(matches!(result, WorktreeRemovalResult::Removed { .. }));
        assert_eq!(remove_attempts, 2);
        assert!(!target.exists());
        assert!(neighbor.exists());
    }

    #[test]
    fn fallback_keeps_a_target_that_changes_before_revalidation() {
        let root = init_repo("remove-fallback-swap");
        let target = add_worktree(&root, "fallback-swap");
        let displaced = root.join("displaced");
        let mut remove_attempts = 0;

        let result = remove_worktree_checked_with(&root, &target, &mut |cwd, args| {
            if args.starts_with(&["worktree", "remove"]) {
                remove_attempts += 1;
                if remove_attempts == 2 {
                    std::fs::rename(&target, &displaced).unwrap();
                    std::fs::create_dir_all(&target).unwrap();
                    std::fs::write(target.join("precious.txt"), "keep").unwrap();
                }
                return Err(not_empty());
            }
            super::git(cwd, args)
        })
        .unwrap();

        assert_eq!(
            kept_reasons(result),
            vec![WorktreeRemovalReason::UnexpectedDirectory]
        );
        assert!(target.join("precious.txt").exists());
    }

    #[test]
    fn inspection_distinguishes_registered_missing_foreign_and_unavailable() {
        let root = init_repo("inspect");
        let target = add_worktree(&root, "registered");
        let foreign = root.join("foreign");
        let missing = root.join("missing");
        let unavailable = root.join("unavailable");
        std::fs::create_dir_all(&foreign).unwrap();
        let mut run_git = |cwd: &Path, args: &[&str]| super::git(cwd, args);

        let registered = inspect_worktree_with(&root, &target, &mut run_git);
        let missing_result = inspect_worktree_with(&root, &missing, &mut run_git);
        let foreign_result = inspect_worktree_with(&root, &foreign, &mut run_git);
        let unavailable_result = inspect_worktree_with(&unavailable, &foreign, &mut run_git);

        assert!(matches!(registered, WorktreeInspection::Registered { .. }));
        assert!(matches!(missing_result, WorktreeInspection::Missing { .. }));
        assert!(matches!(
            foreign_result,
            WorktreeInspection::ForeignDirectory { .. }
        ));
        assert!(matches!(
            unavailable_result,
            WorktreeInspection::RepositoryUnavailable { .. }
        ));
    }

    fn make_worktree_dir(parent: &Path, name: &str, bytes: usize) -> PathBuf {
        let dir = parent.join(name);
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(dir.join("src").join("main.ts"), "x".repeat(bytes)).unwrap();
        dir
    }

    #[test]
    fn a_folder_git_forgot_and_no_session_claims_is_reported_with_its_size() {
        let root = temp_root("orphan-scan");
        let parent = root.join(".goodboy").join("worktrees");
        std::fs::create_dir_all(&parent).unwrap();
        let registered = make_worktree_dir(&parent, "gb-live", 10);
        let claimed = make_worktree_dir(&parent, "gb-known", 10);
        let orphan = make_worktree_dir(&parent, "gb-ghost", 4096);

        let found = collect_orphans(
            &root,
            &[registered.to_string_lossy().into_owned()],
            &[claimed.to_string_lossy().into_owned()],
        );

        assert_eq!(
            found.iter().map(|o| o.name.as_str()).collect::<Vec<_>>(),
            vec!["gb-ghost", "gb-live"]
        );
        assert_eq!(found[0].size_bytes, 4096);
        assert!(!found[0].is_registered);
        assert!(found[1].is_registered);
        assert!(orphan.exists());
        assert!(registered.exists());
        assert!(claimed.exists());
    }

    #[test]
    fn directory_size_counts_files_without_following_symlinks() {
        let root = temp_root("directory-size");
        let target = root.join("target");
        let external = root.join("external.bin");
        std::fs::create_dir_all(target.join("nested")).unwrap();
        std::fs::write(target.join("one.bin"), vec![0u8; 10]).unwrap();
        std::fs::write(target.join("nested").join("two.bin"), vec![0u8; 25]).unwrap();
        std::fs::write(&external, vec![0u8; 4096]).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&external, target.join("external-link")).unwrap();

        let result = worktree_directory_size_blocking(target.to_string_lossy().into_owned());

        assert_eq!(result.size_bytes, Some(35));
        assert!(!result.is_partial);
        assert!(result.exists);
    }

    #[test]
    fn absent_directory_has_no_size() {
        let root = temp_root("directory-size-missing");
        let target = root.join("missing");

        let result = worktree_directory_size_blocking(target.to_string_lossy().into_owned());

        assert_eq!(result.size_bytes, None);
        assert!(!result.is_partial);
        assert!(!result.exists);
    }

    #[cfg(unix)]
    #[test]
    fn unreadable_directory_is_distinct_from_an_empty_directory() {
        use std::os::unix::fs::PermissionsExt;

        let root = temp_root("directory-size-unreadable");
        let empty = root.join("empty");
        let unreadable = root.join("unreadable");
        std::fs::create_dir_all(&empty).unwrap();
        std::fs::create_dir_all(&unreadable).unwrap();
        std::fs::set_permissions(&unreadable, std::fs::Permissions::from_mode(0o000)).unwrap();

        let empty_result = worktree_directory_size_blocking(empty.to_string_lossy().into_owned());
        let unreadable_result =
            worktree_directory_size_blocking(unreadable.to_string_lossy().into_owned());

        std::fs::set_permissions(&unreadable, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(empty_result.size_bytes, Some(0));
        assert!(!empty_result.is_partial);
        assert_eq!(unreadable_result.size_bytes, None);
        assert!(unreadable_result.is_partial);
    }

    #[cfg(unix)]
    #[test]
    fn unreadable_child_marks_a_partial_size() {
        use std::os::unix::fs::PermissionsExt;

        let root = temp_root("directory-size-partial");
        let target = root.join("target");
        let unreadable = target.join("unreadable");
        std::fs::create_dir_all(&unreadable).unwrap();
        std::fs::write(target.join("readable.bin"), vec![0u8; 17]).unwrap();
        std::fs::write(unreadable.join("hidden.bin"), vec![0u8; 100]).unwrap();
        std::fs::set_permissions(&unreadable, std::fs::Permissions::from_mode(0o000)).unwrap();

        let result = worktree_directory_size_blocking(target.to_string_lossy().into_owned());

        std::fs::set_permissions(&unreadable, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(result.size_bytes, Some(17));
        assert!(result.is_partial);
        assert!(result.exists);
    }

    #[test]
    fn orphan_removal_refuses_a_path_outside_the_worktrees_folder() {
        let root = temp_root("orphan-confine");
        std::fs::create_dir_all(root.join(".goodboy").join("worktrees")).unwrap();
        let outside = root.join("precious");
        std::fs::create_dir_all(&outside).unwrap();

        let outcome = worktree_orphan_remove_blocking(
            root.to_string_lossy().into_owned(),
            outside.to_string_lossy().into_owned(),
        );

        assert!(outcome.is_err(), "{outcome:?}");
        assert!(outside.exists(), "a path outside the folder was deleted");
    }
}

#[cfg(test)]
mod candidate_tests {
    use super::{
        worktree_integrate_candidate_blocking, worktree_quarantine_candidate_blocking,
        IntegrateCandidateArgs, QuarantineCandidateArgs,
    };
    use std::path::{Path, PathBuf};

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "goodboy-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn git_ok(cwd: &Path, args: &[&str]) -> String {
        super::git(cwd, args)
            .unwrap_or_else(|err| panic!("git {} failed: {err}", args.join(" ")))
            .trim()
            .to_string()
    }

    fn init_repo(name: &str) -> PathBuf {
        let root = temp_root(name);
        git_ok(&root, &["init", "-b", "main"]);
        git_ok(&root, &["config", "user.email", "test@example.com"]);
        git_ok(&root, &["config", "user.name", "test"]);
        git_ok(&root, &["config", "commit.gpgsign", "false"]);
        root
    }

    fn commit(root: &Path, file: &str, body: &str, message: &str) -> String {
        std::fs::write(root.join(file), body).unwrap();
        git_ok(root, &["add", file]);
        git_ok(root, &["commit", "--no-verify", "-m", message]);
        git_ok(root, &["rev-parse", "HEAD"])
    }

    fn head(root: &Path) -> String {
        git_ok(root, &["rev-parse", "HEAD"])
    }

    fn quarantine(root: &Path, id: &str, base: &str) -> Option<String> {
        worktree_quarantine_candidate_blocking(QuarantineCandidateArgs {
            worktree_path: root.to_string_lossy().into_owned(),
            candidate_id: id.to_string(),
            base_sha: base.to_string(),
        })
        .unwrap()
        .sha
    }

    fn integrate(
        root: &Path,
        id: &str,
        candidate: &str,
        expected: &str,
    ) -> Result<String, super::WorktreeError> {
        worktree_integrate_candidate_blocking(IntegrateCandidateArgs {
            worktree_path: root.to_string_lossy().into_owned(),
            candidate_id: id.to_string(),
            candidate_sha: candidate.to_string(),
            expected_head: expected.to_string(),
        })
        .map(|done| done.sha)
    }

    #[test]
    fn quarantine_moves_the_branch_back_and_keeps_the_work_alive() {
        let root = init_repo("candidate-quarantine");
        let base = commit(&root, "base.txt", "base", "base");
        commit(&root, "fix.txt", "fix", "fix");
        std::fs::write(root.join("loose.txt"), "loose").unwrap();

        let candidate = quarantine(&root, "cand-1", &base).expect("a candidate was produced");

        assert_eq!(head(&root), base, "the branch tip still carries the work");
        assert!(!root.join("fix.txt").exists(), "the tree was not reset");
        assert_eq!(
            git_ok(&root, &["status", "--porcelain=v1"]),
            "",
            "the worktree is not clean"
        );
        assert_eq!(
            git_ok(&root, &["rev-parse", "refs/goodboy/candidates/cand-1"]),
            candidate,
            "the candidate ref does not hold the work"
        );
        assert!(
            git_ok(&root, &["show", &format!("{candidate}:loose.txt")]).contains("loose"),
            "uncommitted work was not captured into the candidate"
        );
    }

    #[test]
    fn quarantine_reports_nothing_when_the_agent_produced_no_change() {
        let root = init_repo("candidate-quarantine-empty");
        let base = commit(&root, "base.txt", "base", "base");

        assert_eq!(quarantine(&root, "cand-empty", &base), None);
        assert_eq!(head(&root), base);
    }

    #[test]
    fn integration_fast_forwards_the_branch_and_the_worktree() {
        let root = init_repo("candidate-integrate");
        let base = commit(&root, "base.txt", "base", "base");
        commit(&root, "fix.txt", "fix", "fix");
        let candidate = quarantine(&root, "cand-1", &base).unwrap();

        let integrated = integrate(&root, "cand-1", &candidate, &base).unwrap();

        assert_eq!(integrated, candidate);
        assert_eq!(head(&root), candidate);
        assert!(root.join("fix.txt").exists(), "the worktree was not synced");
    }

    #[test]
    fn integration_refuses_when_the_head_moved_under_the_candidate() {
        let root = init_repo("candidate-head-moved");
        let base = commit(&root, "base.txt", "base", "base");
        commit(&root, "fix.txt", "fix", "fix");
        let candidate = quarantine(&root, "cand-1", &base).unwrap();
        let moved = commit(&root, "other.txt", "other", "external");

        let outcome = integrate(&root, "cand-1", &candidate, &base);

        assert!(outcome.is_err(), "{outcome:?}");
        assert_eq!(head(&root), moved, "the branch was moved anyway");
        assert!(
            super::git(&root, &["merge-base", "--is-ancestor", &candidate, &moved]).is_err(),
            "the candidate leaked into the branch tip"
        );
    }

    #[test]
    fn a_replayed_integration_after_a_crash_does_not_integrate_twice() {
        let root = init_repo("candidate-replay");
        let base = commit(&root, "base.txt", "base", "base");
        commit(&root, "fix.txt", "fix", "fix");
        let candidate = quarantine(&root, "cand-1", &base).unwrap();
        integrate(&root, "cand-1", &candidate, &base).unwrap();
        let after_first = head(&root);
        let follow_up = commit(&root, "later.txt", "later", "later");

        let replayed = integrate(&root, "cand-1", &candidate, &base).unwrap();

        assert_eq!(replayed, candidate, "the replay reported another commit");
        assert_eq!(after_first, candidate);
        assert_eq!(head(&root), follow_up, "the replay moved the branch");
        assert_eq!(
            git_ok(&root, &["rev-list", "--count", &format!("{base}..HEAD")]),
            "2",
            "the candidate was integrated twice"
        );
    }

    #[test]
    fn a_journal_naming_another_commit_is_refused() {
        let root = init_repo("candidate-journal-mismatch");
        let base = commit(&root, "base.txt", "base", "base");
        commit(&root, "fix.txt", "fix", "fix");
        let first = quarantine(&root, "cand-1", &base).unwrap();
        integrate(&root, "cand-1", &first, &base).unwrap();
        commit(&root, "second.txt", "second", "second");
        let second = quarantine(&root, "cand-1", &first).unwrap();

        let outcome = integrate(&root, "cand-1", &second, &first);

        assert!(outcome.is_err(), "{outcome:?}");
        assert_eq!(head(&root), first);
    }

    #[test]
    fn a_deferred_candidate_never_becomes_reachable_from_the_tip() {
        let root = init_repo("candidate-deferred");
        let base = commit(&root, "base.txt", "base", "base");
        commit(&root, "a.txt", "a", "a");
        let accepted = quarantine(&root, "cand-a", &base).unwrap();
        integrate(&root, "cand-a", &accepted, &base).unwrap();
        commit(&root, "b.txt", "b", "b");
        let deferred = quarantine(&root, "cand-b", &accepted).unwrap();

        assert_eq!(head(&root), accepted);
        assert!(
            super::git(&root, &["merge-base", "--is-ancestor", &deferred, &accepted]).is_err(),
            "the deferred candidate is reachable from the branch tip"
        );
        assert!(!root.join("b.txt").exists(), "deferred work is in the tree");
    }
}
