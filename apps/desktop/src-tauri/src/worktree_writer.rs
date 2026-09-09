use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

pub const UNBOUND_LEASE_STEAL_AFTER: Duration = Duration::from_secs(120);

#[derive(Debug, Clone)]
pub struct LeaseHolder {
    id: String,
    token: String,
    run_id: Option<String>,
    has_exited: bool,
    granted_at: Instant,
}

#[derive(Debug, Default)]
pub struct LeaseSlot {
    holder: Option<LeaseHolder>,
    waiters: Vec<String>,
}

type LeaseMap = HashMap<String, LeaseSlot>;
pub type WriterLeaseRegistry = Arc<Mutex<LeaseMap>>;

#[derive(Default)]
pub struct WriterLeases(pub WriterLeaseRegistry);

impl WriterLeases {
    pub fn new() -> Self {
        Self::default()
    }
}

static NEXT_TOKEN: AtomicU64 = AtomicU64::new(1);

fn next_token() -> String {
    NEXT_TOKEN.fetch_add(1, Ordering::Relaxed).to_string()
}

fn lock(registry: &WriterLeaseRegistry) -> MutexGuard<'_, LeaseMap> {
    registry
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriterLeaseStatus {
    pub path: String,
    pub holder: Option<String>,
    pub token: Option<String>,
    pub run_id: Option<String>,
    pub is_granted: bool,
    pub has_exited: bool,
    pub waiting: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriterLeaseEvent {
    pub path: String,
    pub holder: String,
    pub reason: &'static str,
}

pub const EVENT_NAME: &str = "worktree_writer_event";

fn status_of(path: &str, slot: Option<&LeaseSlot>, is_granted: bool) -> WriterLeaseStatus {
    let holder = slot.and_then(|entry| entry.holder.as_ref());
    WriterLeaseStatus {
        path: path.to_string(),
        holder: holder.map(|entry| entry.id.clone()),
        token: if is_granted {
            holder.map(|entry| entry.token.clone())
        } else {
            None
        },
        run_id: holder.and_then(|entry| entry.run_id.clone()),
        is_granted,
        has_exited: holder.map(|entry| entry.has_exited).unwrap_or(false),
        waiting: slot.map(|entry| entry.waiters.clone()).unwrap_or_default(),
    }
}

fn is_abandoned_before_spawn(current: &LeaseHolder, now: Instant) -> bool {
    current.run_id.is_none()
        && now.saturating_duration_since(current.granted_at) >= UNBOUND_LEASE_STEAL_AFTER
}

pub fn is_lease_live(registry: &WriterLeaseRegistry, path: &str) -> bool {
    is_lease_live_at(&lock(registry), path, Instant::now())
}

fn is_lease_live_at(map: &LeaseMap, path: &str, now: Instant) -> bool {
    map.get(path)
        .and_then(|slot| slot.holder.as_ref())
        .map(|holder| !holder.has_exited && !is_abandoned_before_spawn(holder, now))
        .unwrap_or(false)
}

fn acquire_at(
    map: &mut LeaseMap,
    path: &str,
    holder: &str,
    token: Option<&str>,
    now: Instant,
) -> WriterLeaseStatus {
    let slot = map.entry(path.to_string()).or_default();
    let is_same_id = slot
        .holder
        .as_ref()
        .map(|current| current.id == holder)
        .unwrap_or(false);
    let is_stealable = slot
        .holder
        .as_ref()
        .map(|current| is_abandoned_before_spawn(current, now))
        .unwrap_or(false);
    let is_free = match slot.holder.as_ref() {
        None => true,
        Some(current) => {
            current.has_exited
                || is_stealable
                || (current.id == holder && token == Some(current.token.as_str()))
        }
    };
    let is_next = slot
        .waiters
        .first()
        .map(|waiting| waiting == holder)
        .unwrap_or(true);
    if is_free && is_next {
        slot.waiters.retain(|waiting| waiting != holder);
        let kept = match slot.holder.take() {
            Some(current) if current.id == holder && !current.has_exited && !is_stealable => {
                Some(current)
            }
            _ => None,
        };
        slot.holder = Some(kept.unwrap_or(LeaseHolder {
            id: holder.to_string(),
            token: next_token(),
            run_id: None,
            has_exited: false,
            granted_at: now,
        }));
        return status_of(path, map.get(path), true);
    }
    if !is_same_id && !slot.waiters.iter().any(|waiting| waiting == holder) {
        slot.waiters.push(holder.to_string());
    }
    status_of(path, map.get(path), false)
}

fn acquire_in(
    map: &mut LeaseMap,
    path: &str,
    holder: &str,
    token: Option<&str>,
) -> WriterLeaseStatus {
    acquire_at(map, path, holder, token, Instant::now())
}

fn release_in(
    map: &mut LeaseMap,
    path: &str,
    holder: &str,
    token: Option<&str>,
) -> (WriterLeaseStatus, bool) {
    let Some(slot) = map.get_mut(path) else {
        return (status_of(path, None, false), false);
    };
    slot.waiters.retain(|waiting| waiting != holder);
    let owns = slot
        .holder
        .as_ref()
        .map(|current| {
            current.id == holder && token.map(|value| value == current.token).unwrap_or(false)
        })
        .unwrap_or(false);
    if owns {
        slot.holder = None;
    }
    let is_empty = slot.holder.is_none() && slot.waiters.is_empty();
    if is_empty {
        map.remove(path);
    }
    (status_of(path, map.get(path), false), owns)
}

fn cancel_in(map: &mut LeaseMap, path: &str, holder: &str) -> WriterLeaseStatus {
    let Some(slot) = map.get_mut(path) else {
        return status_of(path, None, false);
    };
    slot.waiters.retain(|waiting| waiting != holder);
    if slot.holder.is_none() && slot.waiters.is_empty() {
        map.remove(path);
    }
    status_of(path, map.get(path), false)
}

fn abandon_in(map: &mut LeaseMap, path: &str, holder: &str) -> (WriterLeaseStatus, bool) {
    let Some(slot) = map.get_mut(path) else {
        return (status_of(path, None, false), false);
    };
    slot.waiters.retain(|waiting| waiting != holder);
    let owns = slot
        .holder
        .as_ref()
        .map(|current| current.id == holder)
        .unwrap_or(false);
    if owns {
        slot.holder = None;
    }
    if slot.holder.is_none() && slot.waiters.is_empty() {
        map.remove(path);
    }
    (status_of(path, map.get(path), false), owns)
}

fn bind_run_in(map: &mut LeaseMap, path: &str, holder: &str, token: &str, run_id: &str) -> bool {
    let Some(current) = map.get_mut(path).and_then(|slot| slot.holder.as_mut()) else {
        return false;
    };
    if current.id != holder
        || current.token != token
        || current.has_exited
        || current.run_id.is_some()
    {
        return false;
    }
    current.run_id = Some(run_id.to_string());
    true
}

fn mark_exited_in(map: &mut LeaseMap, path: &str, holder: &str, token: &str) -> bool {
    let Some(current) = map.get_mut(path).and_then(|slot| slot.holder.as_mut()) else {
        return false;
    };
    if current.id != holder || current.token != token {
        return false;
    }
    current.has_exited = true;
    true
}

fn emit_lease_event(app: &AppHandle, path: &str, holder: &str, reason: &'static str) {
    let _ = app.emit(
        EVENT_NAME,
        WriterLeaseEvent {
            path: path.to_string(),
            holder: holder.to_string(),
            reason,
        },
    );
}

pub struct RunLeaseGuard {
    registry: WriterLeaseRegistry,
    path: String,
    holder: String,
    token: String,
    on_exit: Box<dyn Fn() + Send>,
}

impl RunLeaseGuard {
    pub fn bind(
        registry: &WriterLeaseRegistry,
        path: &str,
        holder: &str,
        token: &str,
        run_id: &str,
        on_exit: impl Fn() + Send + 'static,
    ) -> Option<Self> {
        if !bind_run_in(&mut lock(registry), path, holder, token, run_id) {
            return None;
        }
        Some(Self {
            registry: Arc::clone(registry),
            path: path.to_string(),
            holder: holder.to_string(),
            token: token.to_string(),
            on_exit: Box::new(on_exit),
        })
    }
}

impl Drop for RunLeaseGuard {
    fn drop(&mut self) {
        let marked = mark_exited_in(
            &mut lock(&self.registry),
            &self.path,
            &self.holder,
            &self.token,
        );
        if marked {
            (self.on_exit)();
        }
    }
}

#[tauri::command]
pub fn worktree_writer_acquire(
    state: State<'_, WriterLeases>,
    path: String,
    holder: String,
    token: Option<String>,
) -> WriterLeaseStatus {
    acquire_in(&mut lock(&state.0), &path, &holder, token.as_deref())
}

#[tauri::command]
pub fn worktree_writer_release(
    app: AppHandle,
    state: State<'_, WriterLeases>,
    path: String,
    holder: String,
    token: Option<String>,
) -> WriterLeaseStatus {
    let (status, released) = release_in(&mut lock(&state.0), &path, &holder, token.as_deref());
    if released {
        emit_lease_event(&app, &path, &holder, "released");
    }
    status
}

#[tauri::command]
pub fn worktree_writer_cancel(
    state: State<'_, WriterLeases>,
    path: String,
    holder: String,
) -> WriterLeaseStatus {
    cancel_in(&mut lock(&state.0), &path, &holder)
}

#[tauri::command]
pub fn worktree_writer_abandon(
    app: AppHandle,
    state: State<'_, WriterLeases>,
    path: String,
    holder: String,
) -> WriterLeaseStatus {
    let (status, released) = abandon_in(&mut lock(&state.0), &path, &holder);
    if released {
        emit_lease_event(&app, &path, &holder, "abandoned");
    }
    status
}

#[tauri::command]
pub fn worktree_writer_status(state: State<'_, WriterLeases>, path: String) -> WriterLeaseStatus {
    let map = lock(&state.0);
    status_of(&path, map.get(&path), false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn granted_token(status: &WriterLeaseStatus) -> String {
        status.token.clone().expect("granted lease carries a token")
    }

    #[test]
    fn acquire_grants_a_free_worktree() {
        let mut map = LeaseMap::new();
        let status = acquire_in(&mut map, "/repo/one", "attempt-a", None);
        assert!(status.is_granted);
        assert_eq!(status.holder.as_deref(), Some("attempt-a"));
        assert!(status.waiting.is_empty());
        assert!(status.token.is_some());
    }

    #[test]
    fn acquire_denies_a_second_holder_and_queues_it() {
        let mut map = LeaseMap::new();
        acquire_in(&mut map, "/repo/one", "attempt-a", None);
        let status = acquire_in(&mut map, "/repo/one", "attempt-b", None);
        assert!(!status.is_granted);
        assert_eq!(status.holder.as_deref(), Some("attempt-a"));
        assert_eq!(status.waiting, vec!["attempt-b".to_string()]);
        assert_eq!(status.token, None);
    }

    #[test]
    fn acquire_is_idempotent_for_the_token_the_holder_was_given() {
        let mut map = LeaseMap::new();
        let first = acquire_in(&mut map, "/repo/one", "attempt-a", None);
        let token = granted_token(&first);
        let status = acquire_in(&mut map, "/repo/one", "attempt-a", Some(&token));
        assert!(status.is_granted);
        assert_eq!(granted_token(&status), token);
        assert!(status.waiting.is_empty());
    }

    #[test]
    fn acquire_refuses_a_second_window_holding_the_same_id_without_the_token() {
        let mut map = LeaseMap::new();
        let first = acquire_in(&mut map, "/repo/one", "agent-1", None);
        let token = map["/repo/one"].holder.as_ref().unwrap().token.clone();
        bind_run_in(&mut map, "/repo/one", "agent-1", &token, "run-1");
        let second = acquire_in(&mut map, "/repo/one", "agent-1", None);
        assert!(!second.is_granted);
        assert!(second.waiting.is_empty());
        let stale = acquire_in(&mut map, "/repo/one", "agent-1", Some("not-the-token"));
        assert!(!stale.is_granted);
        let again = acquire_in(
            &mut map,
            "/repo/one",
            "agent-1",
            Some(&granted_token(&first)),
        );
        assert!(again.is_granted);
        assert_eq!(again.run_id.as_deref(), Some("run-1"));
    }

    #[test]
    fn distinct_worktrees_are_independent() {
        let mut map = LeaseMap::new();
        let first = acquire_in(&mut map, "/repo/one", "attempt-a", None);
        let second = acquire_in(&mut map, "/repo/two", "attempt-b", None);
        assert!(first.is_granted);
        assert!(second.is_granted);
    }

    #[test]
    fn waiters_keep_their_arrival_order() {
        let mut map = LeaseMap::new();
        acquire_in(&mut map, "/repo/one", "attempt-a", None);
        acquire_in(&mut map, "/repo/one", "attempt-b", None);
        acquire_in(&mut map, "/repo/one", "attempt-c", None);
        acquire_in(&mut map, "/repo/one", "attempt-b", None);
        let status = acquire_in(&mut map, "/repo/one", "attempt-c", None);
        assert_eq!(
            status.waiting,
            vec!["attempt-b".to_string(), "attempt-c".to_string()]
        );
    }

    #[test]
    fn release_hands_the_worktree_to_the_first_waiter() {
        let mut map = LeaseMap::new();
        let first = acquire_in(&mut map, "/repo/one", "attempt-a", None);
        acquire_in(&mut map, "/repo/one", "attempt-b", None);
        acquire_in(&mut map, "/repo/one", "attempt-c", None);
        let (_, released) = release_in(
            &mut map,
            "/repo/one",
            "attempt-a",
            Some(&granted_token(&first)),
        );
        assert!(released);
        let denied = acquire_in(&mut map, "/repo/one", "attempt-c", None);
        assert!(!denied.is_granted);
        let granted = acquire_in(&mut map, "/repo/one", "attempt-b", None);
        assert!(granted.is_granted);
        assert_eq!(granted.waiting, vec!["attempt-c".to_string()]);
    }

    #[test]
    fn releasing_a_waiter_frees_the_worktree_for_the_next_one() {
        let mut map = LeaseMap::new();
        let first = acquire_in(&mut map, "/repo/one", "attempt-a", None);
        acquire_in(&mut map, "/repo/one", "attempt-b", None);
        acquire_in(&mut map, "/repo/one", "attempt-c", None);
        cancel_in(&mut map, "/repo/one", "attempt-b");
        let (_, released) = release_in(
            &mut map,
            "/repo/one",
            "attempt-a",
            Some(&granted_token(&first)),
        );
        assert!(released);
        let granted = acquire_in(&mut map, "/repo/one", "attempt-c", None);
        assert!(granted.is_granted);
    }

    #[test]
    fn release_from_a_waiter_only_cancels_its_wait() {
        let mut map = LeaseMap::new();
        acquire_in(&mut map, "/repo/one", "attempt-a", None);
        let second = acquire_in(&mut map, "/repo/one", "attempt-b", None);
        let (status, released) =
            release_in(&mut map, "/repo/one", "attempt-b", second.token.as_deref());
        assert!(!released);
        assert_eq!(status.holder.as_deref(), Some("attempt-a"));
        assert!(status.waiting.is_empty());
    }

    #[test]
    fn release_from_a_stale_holder_keeps_the_current_one() {
        let mut map = LeaseMap::new();
        let first = acquire_in(&mut map, "/repo/one", "attempt-a", None);
        let stale = granted_token(&first);
        let (_, released) = release_in(&mut map, "/repo/one", "attempt-a", Some(&stale));
        assert!(released);
        acquire_in(&mut map, "/repo/one", "attempt-b", None);
        let (status, released_again) = release_in(&mut map, "/repo/one", "attempt-a", Some(&stale));
        assert!(!released_again);
        assert_eq!(status.holder.as_deref(), Some("attempt-b"));
    }

    #[test]
    fn a_release_without_a_token_never_unseats_the_holder() {
        let mut map = LeaseMap::new();
        acquire_in(&mut map, "/repo/one", "agent-1", None);
        let token = map["/repo/one"].holder.as_ref().unwrap().token.clone();
        bind_run_in(&mut map, "/repo/one", "agent-1", &token, "run-1");
        let (status, released) = release_in(&mut map, "/repo/one", "agent-1", None);
        assert!(!released);
        assert_eq!(status.holder.as_deref(), Some("agent-1"));
        let denied = acquire_in(&mut map, "/repo/one", "agent-2", None);
        assert!(!denied.is_granted);
        assert_eq!(denied.holder.as_deref(), Some("agent-1"));
    }

    #[test]
    fn cancel_drops_a_wait_and_leaves_the_holder_in_place() {
        let mut map = LeaseMap::new();
        acquire_in(&mut map, "/repo/one", "agent-1", None);
        acquire_in(&mut map, "/repo/one", "agent-2", None);
        let status = cancel_in(&mut map, "/repo/one", "agent-2");
        assert_eq!(status.holder.as_deref(), Some("agent-1"));
        assert!(status.waiting.is_empty());
        let self_cancel = cancel_in(&mut map, "/repo/one", "agent-1");
        assert_eq!(self_cancel.holder.as_deref(), Some("agent-1"));
    }

    #[test]
    fn abandoning_a_holder_frees_the_worktree_for_the_next_one() {
        let mut map = LeaseMap::new();
        acquire_in(&mut map, "/repo/one", "agent-1", None);
        acquire_in(&mut map, "/repo/one", "agent-2", None);
        let (status, released) = abandon_in(&mut map, "/repo/one", "agent-1");
        assert!(released);
        assert_eq!(status.holder, None);
        let granted = acquire_in(&mut map, "/repo/one", "agent-2", None);
        assert!(granted.is_granted);
        let (_, released_again) = abandon_in(&mut map, "/repo/one", "agent-1");
        assert!(!released_again);
    }

    #[test]
    fn a_lease_that_never_bound_a_run_is_stolen_once_the_grace_runs_out() {
        let mut map = LeaseMap::new();
        let start = Instant::now();
        let first = acquire_at(&mut map, "/repo/one", "agent-1", None, start);
        assert!(first.is_granted);
        let early = acquire_at(
            &mut map,
            "/repo/one",
            "agent-2",
            None,
            start + UNBOUND_LEASE_STEAL_AFTER - Duration::from_secs(1),
        );
        assert!(!early.is_granted);
        let stolen = acquire_at(
            &mut map,
            "/repo/one",
            "agent-2",
            None,
            start + UNBOUND_LEASE_STEAL_AFTER,
        );
        assert!(stolen.is_granted);
        assert_eq!(stolen.holder.as_deref(), Some("agent-2"));
        assert_ne!(stolen.token, first.token);
    }

    #[test]
    fn a_lease_bound_to_a_run_is_never_stolen_however_long_it_runs() {
        let mut map = LeaseMap::new();
        let start = Instant::now();
        acquire_at(&mut map, "/repo/one", "agent-1", None, start);
        let token = map["/repo/one"].holder.as_ref().unwrap().token.clone();
        bind_run_in(&mut map, "/repo/one", "agent-1", &token, "run-1");
        let denied = acquire_at(
            &mut map,
            "/repo/one",
            "agent-2",
            None,
            start + UNBOUND_LEASE_STEAL_AFTER * 10,
        );
        assert!(!denied.is_granted);
        assert_eq!(denied.holder.as_deref(), Some("agent-1"));
    }

    #[test]
    fn a_window_that_lost_its_token_reclaims_its_own_stale_lease_with_a_fresh_one() {
        let mut map = LeaseMap::new();
        let start = Instant::now();
        let first = acquire_at(&mut map, "/repo/one", "agent-1", None, start);
        let reclaimed = acquire_at(
            &mut map,
            "/repo/one",
            "agent-1",
            None,
            start + UNBOUND_LEASE_STEAL_AFTER,
        );
        assert!(reclaimed.is_granted);
        assert_ne!(reclaimed.token, first.token);
        let (_, released) = release_in(
            &mut map,
            "/repo/one",
            "agent-1",
            Some(&granted_token(&first)),
        );
        assert!(!released);
        assert!(!bind_run_in(
            &mut map,
            "/repo/one",
            "agent-1",
            &granted_token(&first),
            "old-run"
        ));
        assert!(!mark_exited_in(
            &mut map,
            "/repo/one",
            "agent-1",
            &granted_token(&first)
        ));
    }

    #[test]
    fn an_orphaned_guard_cannot_mark_a_reclaimed_same_id_lease_exited() {
        let registry = WriterLeases::new().0;
        let first = acquire_in(&mut lock(&registry), "/repo/one", "agent-1", None);
        let old_guard = RunLeaseGuard::bind(
            &registry,
            "/repo/one",
            "agent-1",
            &granted_token(&first),
            "old-run",
            || {},
        )
        .unwrap();
        abandon_in(&mut lock(&registry), "/repo/one", "agent-1");
        let reclaimed = acquire_in(&mut lock(&registry), "/repo/one", "agent-1", None);
        let new_guard = RunLeaseGuard::bind(
            &registry,
            "/repo/one",
            "agent-1",
            &granted_token(&reclaimed),
            "new-run",
            || {},
        )
        .unwrap();
        drop(old_guard);
        let status = status_of("/repo/one", lock(&registry).get("/repo/one"), false);
        assert!(!status.has_exited);
        assert_eq!(status.run_id.as_deref(), Some("new-run"));
        assert!(!acquire_in(&mut lock(&registry), "/repo/one", "agent-2", None).is_granted);
        drop(new_guard);
        assert!(acquire_in(&mut lock(&registry), "/repo/one", "agent-2", None).is_granted);
    }

    #[test]
    fn binding_refuses_a_stolen_lease_and_preserves_the_new_run() {
        let mut map = LeaseMap::new();
        let start = Instant::now();
        let first = acquire_at(&mut map, "/repo/one", "agent-1", None, start);
        let stolen = acquire_at(
            &mut map,
            "/repo/one",
            "agent-2",
            None,
            start + UNBOUND_LEASE_STEAL_AFTER,
        );
        assert!(!bind_run_in(
            &mut map,
            "/repo/one",
            "agent-1",
            &granted_token(&first),
            "old-run"
        ));
        assert!(bind_run_in(
            &mut map,
            "/repo/one",
            "agent-2",
            &granted_token(&stolen),
            "new-run"
        ));
        assert!(!bind_run_in(
            &mut map,
            "/repo/one",
            "agent-2",
            &granted_token(&stolen),
            "duplicate-run"
        ));
        assert_eq!(
            status_of("/repo/one", map.get("/repo/one"), false)
                .run_id
                .as_deref(),
            Some("new-run")
        );
    }

    #[test]
    fn a_stolen_lease_outranks_a_waiter_that_arrived_first() {
        let mut map = LeaseMap::new();
        let start = Instant::now();
        acquire_at(&mut map, "/repo/one", "agent-1", None, start);
        acquire_at(&mut map, "/repo/one", "agent-2", None, start);
        let jumped = acquire_at(
            &mut map,
            "/repo/one",
            "agent-3",
            None,
            start + UNBOUND_LEASE_STEAL_AFTER,
        );
        assert!(!jumped.is_granted);
        let granted = acquire_at(
            &mut map,
            "/repo/one",
            "agent-2",
            None,
            start + UNBOUND_LEASE_STEAL_AFTER,
        );
        assert!(granted.is_granted);
    }

    #[test]
    fn release_with_a_stale_token_keeps_the_current_lease() {
        let mut map = LeaseMap::new();
        let first = acquire_in(&mut map, "/repo/one", "agent-1", None);
        let stale = granted_token(&first);
        release_in(&mut map, "/repo/one", "agent-1", Some(&stale));
        let second = acquire_in(&mut map, "/repo/one", "agent-1", None);
        assert!(second.is_granted);
        let (status, released) = release_in(&mut map, "/repo/one", "agent-1", Some(&stale));
        assert!(!released);
        assert_eq!(status.holder.as_deref(), Some("agent-1"));
    }

    #[test]
    fn an_exited_process_makes_the_lease_reclaimable() {
        let mut map = LeaseMap::new();
        acquire_in(&mut map, "/repo/one", "attempt-a", None);
        let token = map["/repo/one"].holder.as_ref().unwrap().token.clone();
        bind_run_in(&mut map, "/repo/one", "attempt-a", &token, "run-1");
        let blocked = acquire_in(&mut map, "/repo/one", "attempt-b", None);
        assert!(!blocked.is_granted);
        assert!(mark_exited_in(&mut map, "/repo/one", "attempt-a", &token));
        let status = acquire_in(&mut map, "/repo/one", "attempt-b", None);
        assert!(status.is_granted);
        assert_eq!(status.holder.as_deref(), Some("attempt-b"));
    }

    #[test]
    fn binding_a_run_requires_the_current_holder() {
        let mut map = LeaseMap::new();
        acquire_in(&mut map, "/repo/one", "attempt-a", None);
        let token = map["/repo/one"].holder.as_ref().unwrap().token.clone();
        bind_run_in(&mut map, "/repo/one", "attempt-b", &token, "run-1");
        assert!(!mark_exited_in(&mut map, "/repo/one", "attempt-b", &token));
        let stale = status_of("/repo/one", map.get("/repo/one"), false);
        assert!(!stale.has_exited);
        assert_eq!(stale.run_id, None);
        let token = map["/repo/one"].holder.as_ref().unwrap().token.clone();
        bind_run_in(&mut map, "/repo/one", "attempt-a", &token, "run-1");
        let bound = status_of("/repo/one", map.get("/repo/one"), false);
        assert_eq!(bound.run_id.as_deref(), Some("run-1"));
    }

    #[test]
    fn status_reports_a_free_worktree() {
        let map = LeaseMap::new();
        let status = status_of("/repo/one", map.get("/repo/one"), false);
        assert_eq!(status.holder, None);
        assert!(!status.is_granted);
        assert!(status.waiting.is_empty());
    }

    #[test]
    fn a_poisoned_registry_still_serves_the_lease() {
        let registry: WriterLeaseRegistry = Arc::new(Mutex::new(LeaseMap::new()));
        let poisoner = Arc::clone(&registry);
        let _ = std::thread::spawn(move || {
            let _guard = poisoner.lock().expect("fresh mutex");
            panic!("poison the registry");
        })
        .join();
        assert!(registry.is_poisoned());
        let status = acquire_in(&mut lock(&registry), "/repo/one", "agent-1", None);
        assert!(status.is_granted);
        let denied = acquire_in(&mut lock(&registry), "/repo/one", "agent-2", None);
        assert!(!denied.is_granted);
    }
}
