import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertTriangle, GitBranch, RefreshCw, X } from 'lucide-react';
import {
  cn,
  DiffLayoutToggle,
  Divider,
  formatError,
  ScrollFade,
  Skeleton,
  Tooltip,
} from '@goodboy/ui';
import { getDefaultTurnModel, parseUnifiedDiff } from '@goodboy/core';
import type {
  BranchCommit,
  DiffComment,
  DiffCommentAnchor,
  DiffView,
  FileDiff,
  AgentId,
  SessionId,
  WorktreeStatus,
} from '@goodboy/types';
import { ghPrDiff } from '../../../../features/github/github';
import { openFileInWorkspace } from '../../../../shared/lib/editor';
import { distanceAhead, distanceBehind } from '../../../../shared/lib/gitStatus';
import { ErrorStrip } from '@goodboy/ui';
import {
  DEFAULT_EDITOR_BINARY,
  SETTING_DEFAULT_EDITOR,
  SETTING_EDITOR_BINARY,
} from '../../../../features/settings/settings';
import {
  useAppStore,
  useDiffComments,
  useSummarizerStatus,
  type DiffFocus,
} from '../../../../store';
import { kindRouting, type AgentKindRouting } from '../../../../features/session/agent-kind';
import { useSessionRoleModels } from '../../../../shared/hooks/useSessionRoleModels';
import { useRebaseAgent } from '../../../../features/session/hooks/useRebaseAgent';
import { clampEffort } from '../../../../features/chat/utils/chat-constants';
import { RoutingPicker } from '../../../../shared/components/RoutingPicker';
import { STORAGE_KEYS, STORAGE_PREFIXES } from '../../../../shared/lib/storage-keys';
import { CONCEPT_ICONS, CONCEPT_TONE, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { LensEmptyState } from '@goodboy/ui';
import { useDiffLayoutMode } from '../../../../shared/hooks/useDiffLayoutMode';
import {
  listBranchCommits,
  worktreeDiff,
  worktreeDiffCommit,
  worktreeDiffWorking,
  worktreeStatus,
} from '../../../../features/worktree/worktree';
import { DiffViewSelector } from '../DiffViewSelector';
import { ResolveOverviewAction } from '../../../resolve/components/ResolveOverviewAction';
import { DIFF_CAPPED_COLUMN_CLASS, TOOLBAR_ICON_BTN, type ReviewState } from './lib';
import { FileRail } from './FileTree/FileRail';
import { FileDiffCard } from './FileDiffCard';
import { DiffToolbar } from './DiffToolbar';
import { NotesFooter } from './NotesFooter';
import { DIFF_VIEWER_PANE_COPY } from './diffViewerPaneCopy';

type Props = {
  onClose: () => void;
  sessionId?: SessionId;
  title?: string;
  loader?: () => Promise<string>;
  repoSlug?: string;
  prNumber?: number;
  cwd?: string;
  workingDir?: string;
  worktreePath?: string;
  jumpToFirstCommented?: boolean;
  jumpToFile?: string;
  diffFocus?: DiffFocus | null;
  showToolbarClose?: boolean;
  presentation?: 'dialog' | 'pane';
  onContentEmptyChange?: (isEmpty: boolean) => void;
  headerActions?: ReactNode;
  eyebrow?: ReactNode;
  branchRevision?: number;
};

const DEFAULT_VIEW: DiffView = { kind: 'branch' };

const DIFF_BATCH_SIZE = 20;

const DIFF_SKELETON_CARDS: ReadonlyArray<ReadonlyArray<string>> = [
  ['72%', '54%', '88%', '40%', '66%', '30%'],
  ['60%', '82%', '46%', '70%'],
];

const loadDiffForView = (worktreePath: string, view: DiffView): Promise<string> => {
  if (view.kind === 'working') {
    return worktreeDiffWorking(worktreePath, view.scope);
  }
  if (view.kind === 'commit') {
    return worktreeDiffCommit(worktreePath, view.sha);
  }
  return worktreeDiff({ worktreePath });
};

const emptyStateLabel = (view: DiffView, isGitAware: boolean): string => {
  if (!isGitAware) {
    return 'No diff available';
  }
  if (view.kind === 'working') {
    if (view.scope === 'staged') {
      return 'No staged changes';
    }
    if (view.scope === 'unstaged') {
      return 'No unstaged changes';
    }
    return 'Working tree clean';
  }
  if (view.kind === 'commit') {
    return 'This commit is empty';
  }
  return 'Branch matches main';
};

const emptyStateBlurb = (view: DiffView, isGitAware: boolean): string | null => {
  if (!isGitAware) {
    return null;
  }
  if (view.kind === 'working') {
    if (view.scope === 'staged') {
      return 'Nothing has been staged for the next commit yet.';
    }
    if (view.scope === 'unstaged') {
      return 'No uncommitted edits in the working tree.';
    }
    return 'No uncommitted edits and nothing staged.';
  }
  if (view.kind === 'commit') {
    return 'No file changes were recorded for this commit.';
  }
  return 'Every commit on this branch is already reachable from main, nothing extra to review.';
};

const SIDEBAR_PREF_KEY = STORAGE_KEYS.diffSidebarCollapsed;

const buildNotesPrompt = (notes: ReadonlyArray<DiffComment>): string => {
  const byFile = new Map<string, DiffComment[]>();
  for (const n of notes) {
    const list = byFile.get(n.filePath) ?? [];
    list.push(n);
    byFile.set(n.filePath, list);
  }
  const sections: string[] = [];
  for (const [file, items] of byFile) {
    const lines = items.map((n) => {
      const anchor = n.anchor
        ? n.anchor.endLineNumber
          ? `[${n.anchor.side}:${n.anchor.lineNumber}-${n.anchor.endLineNumber}]`
          : `[${n.anchor.side}:${n.anchor.lineNumber}]`
        : '[file-level]';
      return `  - ${anchor} (id ${n.id}) ${n.body.replace(/\n+/g, ' ')}`;
    });
    sections.push(`### ${file}\n${lines.join('\n')}`);
  }
  const header = [
    'open review notes on these files. each note is anchored to a specific line of the diff.',
    '',
    '**mode: PROPOSE-ONLY**',
    '- do NOT modify any code.',
    '- for each note, produce: context, proposed fix (snippet), affected file/line.',
    '- end with a summary plan (note → fix) for me to approve.',
  ].join('\n');
  return `${header}\n\n${sections.join('\n\n')}`;
};

const readSidebarPref = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.localStorage.getItem(SIDEBAR_PREF_KEY) !== '0';
};

const writeSidebarPref = (collapsed: boolean): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? '1' : '0');
};

type ReviewedMap = Record<string, string>;

type RegisterFileRefParams = {
  path: string;
};

const viewKeyOf = (view: DiffView): string => {
  if (view.kind === 'commit') {
    return `commit:${view.sha}`;
  }
  if (view.kind === 'working') {
    return `working:${view.scope}`;
  }
  return 'branch';
};

const fileSignature = (f: FileDiff): string =>
  `${f.status}:${f.additions}:${f.deletions}:${f.hunks.length}:${f.hunks
    .map((h) => h.header)
    .join('§')}`;

const reviewedStorageKey = (sessionId: SessionId | undefined, view: DiffView): string | null =>
  sessionId ? `${STORAGE_PREFIXES.diffReviewed}${sessionId}:${viewKeyOf(view)}` : null;

const readReviewedMap = (sessionId: SessionId | undefined, view: DiffView): ReviewedMap => {
  const key = reviewedStorageKey(sessionId, view);
  if (!key || typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ReviewedMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeReviewedMap = (
  sessionId: SessionId | undefined,
  view: DiffView,
  map: ReviewedMap,
): void => {
  const key = reviewedStorageKey(sessionId, view);
  if (!key || typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {}
};

export const DiffViewerContent = ({
  onClose,
  sessionId,
  title,
  loader,
  repoSlug,
  prNumber,
  cwd,
  workingDir,
  worktreePath,
  jumpToFirstCommented = false,
  jumpToFile,
  diffFocus = null,
  showToolbarClose = true,
  presentation = 'dialog',
  onContentEmptyChange,
  headerActions,
  eyebrow,
  branchRevision = 0,
}: Props) => {
  const [files, setFiles] = useState<ReadonlyArray<FileDiff>>([]);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [mountedCount, setMountedCount] = useState(DIFF_BATCH_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarPref);
  const [layoutMode, setLayoutMode] = useDiffLayoutMode();
  const [activePath, setActivePath] = useState<string | null>(null);
  const fileRefs = useRef<Map<string, HTMLElement>>(new Map());
  const fileRefCallbacks = useRef<Map<string, React.RefCallback<HTMLElement>>>(new Map());
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  const pendingScrollPath = useRef<string | null>(null);

  const [view, setView] = useState<DiffView>(DEFAULT_VIEW);
  const [commits, setCommits] = useState<ReadonlyArray<BranchCommit>>([]);
  const [status, setStatus] = useState<WorktreeStatus | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const isGitAware = Boolean(worktreePath);

  const comments = useDiffComments(sessionId ?? null);
  const loadDiffComments = useAppStore((s) => s.loadDiffComments);
  const addDiffComment = useAppStore((s) => s.addDiffComment);
  const resolveDiffComment = useAppStore((s) => s.resolveDiffComment);
  const consumeDiffComments = useAppStore((s) => s.consumeDiffComments);
  const reopenDiffComment = useAppStore((s) => s.reopenDiffComment);
  const connectedProviderIds = useAppStore(
    useShallow((s) => s.providers.filter((p) => p.connection === 'connected').map((p) => p.id)),
  );
  const deleteDiffComment = useAppStore((s) => s.deleteDiffComment);
  const summarizer = useSummarizerStatus(sessionId ?? null);
  const prevSummarizerStatus = useRef(summarizer.status);

  const editorBinary = useAppStore(
    (s) =>
      s.settings[SETTING_DEFAULT_EDITOR] ??
      s.settings[SETTING_EDITOR_BINARY] ??
      DEFAULT_EDITOR_BINARY,
  );
  const selectAgent = useAppStore((s) => s.selectAgent);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const sendTurn = useAppStore((s) => s.sendTurn);
  const setActiveLens = useAppStore((s) => s.setActiveLens);
  const [spawning, setSpawning] = useState(false);
  const resolverRoleModels = useSessionRoleModels({ sessionId: sessionId ?? null });
  const [resolverRouting, setResolverRouting] = useState<AgentKindRouting>(() =>
    kindRouting({ kind: 'resolver', roleModels: resolverRoleModels }),
  );

  useEffect(() => {
    if (
      isGitAware &&
      prevSummarizerStatus.current === 'running' &&
      summarizer.status !== 'running'
    ) {
      setRefreshTick((t) => t + 1);
    }
    prevSummarizerStatus.current = summarizer.status;
  }, [summarizer.status, isGitAware]);

  const phaseRuns = useAppStore((s) =>
    sessionId ? (s.sessionPhaseRuns[sessionId] ?? null) : null,
  );
  const rebase = useRebaseAgent({ sessionId: sessionId ?? null, status });
  const agentNameById = useMemo(() => {
    const m = new Map<AgentId, string>();
    if (phaseRuns) {
      for (const r of phaseRuns) m.set(r.id, r.name);
    }
    return m;
  }, [phaseRuns]);

  const openCommentsByFile = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) {
      if (c.status !== 'open') {
        continue;
      }
      m.set(c.filePath, (m.get(c.filePath) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  const commentsByFile = useMemo(() => {
    const m = new Map<string, DiffComment[]>();
    for (const c of comments) {
      const arr = m.get(c.filePath);
      if (arr) {
        arr.push(c);
      } else {
        m.set(c.filePath, [c]);
      }
    }
    return m;
  }, [comments]);

  const [reviewedMap, setReviewedMap] = useState<ReviewedMap>(() =>
    readReviewedMap(sessionId, view),
  );
  useEffect(() => {
    setReviewedMap(readReviewedMap(sessionId, view));
  }, [sessionId, view, files]);

  const reviewStateByPath = useMemo(() => {
    const m = new Map<string, ReviewState>();
    for (const f of files) {
      const saved = reviewedMap[f.path];
      m.set(f.path, !saved ? 'none' : saved === fileSignature(f) ? 'reviewed' : 'stale');
    }
    return m;
  }, [files, reviewedMap]);

  const reviewedCount = useMemo(() => {
    let n = 0;
    for (const s of reviewStateByPath.values()) {
      if (s === 'reviewed') {
        n += 1;
      }
    }
    return n;
  }, [reviewStateByPath]);

  const toggleReviewed = useCallback(
    (file: FileDiff, next: boolean) => {
      setReviewedMap((prev) => {
        const updated = { ...prev };
        if (next) {
          updated[file.path] = fileSignature(file);
        } else {
          delete updated[file.path];
        }
        writeReviewedMap(sessionId, view, updated);
        return updated;
      });
    },
    [sessionId, view],
  );

  useEffect(() => {
    if (diffFocus == null) {
      return;
    }
    setView(
      diffFocus.kind === 'working'
        ? { kind: 'working', scope: 'all' }
        : { kind: 'commit', sha: diffFocus.sha },
    );
    setFocusPath(diffFocus.path);
  }, [diffFocus, setView]);

  useEffect(() => {
    if (!worktreePath) {
      return;
    }
    let cancelled = false;
    Promise.all([listBranchCommits(worktreePath), worktreeStatus({ worktreePath })])
      .then(([c, s]) => {
        if (cancelled) {
          return;
        }
        setCommits(c);
        setStatus(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [worktreePath, refreshTick, branchRevision]);

  useEffect(() => {
    didInitialScroll.current = false;
  }, [view, refreshTick]);

  useLayoutEffect(() => {
    pendingScrollPath.current = null;
    setMountedCount(DIFF_BATCH_SIZE);
  }, [files]);

  useEffect(() => {
    if (mountedCount >= files.length) {
      return;
    }
    const schedule = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : setTimeout;
    const cancel = typeof cancelIdleCallback !== 'undefined' ? cancelIdleCallback : clearTimeout;
    const id = schedule(() => {
      setMountedCount((prev) => Math.min(prev + DIFF_BATCH_SIZE, files.length));
    });
    return () => {
      cancel(id as number);
    };
  }, [mountedCount, files]);

  useEffect(() => {
    const fetcher = isGitAware
      ? () => loadDiffForView(worktreePath as string, view)
      : (loader ??
        (repoSlug !== undefined && prNumber !== undefined
          ? () => ghPrDiff(repoSlug, prNumber, cwd)
          : null));
    if (!fetcher) {
      setError('no diff source configured');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((raw) => {
        if (cancelled) {
          return;
        }
        setFiles(parseUnifiedDiff(raw));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(formatError(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGitAware, worktreePath, view, refreshTick, loader, repoSlug, prNumber, cwd]);

  useEffect(() => {
    if (sessionId) {
      void loadDiffComments(sessionId);
    }
  }, [sessionId, loadDiffComments]);

  const scrollToFile = useCallback(
    (path: string) => {
      const fileElement = fileRefs.current.get(path);
      if (fileElement != null) {
        fileElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }

      const fileIndex = files.findIndex((file) => file.path === path);
      if (fileIndex < 0) {
        return;
      }

      pendingScrollPath.current = path;
      const requiredCount = Math.min(
        Math.ceil((fileIndex + 1) / DIFF_BATCH_SIZE) * DIFF_BATCH_SIZE,
        files.length,
      );
      setMountedCount((currentCount) => Math.max(currentCount, requiredCount));
    },
    [files],
  );

  useEffect(() => {
    const path = pendingScrollPath.current;
    if (path == null) {
      return;
    }

    const fileElement = fileRefs.current.get(path);
    if (fileElement == null) {
      return;
    }

    pendingScrollPath.current = null;
    fileElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [mountedCount]);

  useEffect(() => {
    if (files.length === 0 || didInitialScroll.current) {
      return;
    }
    let target: string | undefined;
    if (jumpToFile) {
      target = files.find((f) => f.path === jumpToFile || jumpToFile.endsWith(f.path))?.path;
    } else if (jumpToFirstCommented && openCommentsByFile.size > 0) {
      target = files.find((f) => openCommentsByFile.has(f.path))?.path;
    }
    if (target) {
      didInitialScroll.current = true;
      const path = target;
      requestAnimationFrame(() => scrollToFile(path));
    }
  }, [files, jumpToFile, jumpToFirstCommented, openCommentsByFile, scrollToFile]);

  useEffect(() => {
    if (focusPath == null || files.length === 0) {
      return;
    }
    const target = files.find((f) => f.path === focusPath || focusPath.endsWith(f.path))?.path;
    setFocusPath(null);
    if (target === undefined) {
      return;
    }
    didInitialScroll.current = true;
    requestAnimationFrame(() => scrollToFile(target));
  }, [files, focusPath, scrollToFile]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || files.length === 0) {
      return;
    }
    const viewport =
      scrollRef.current?.querySelector<HTMLElement>('.overflow-y-auto') ?? scrollRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        let topmostEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          if (
            topmostEntry !== null &&
            entry.boundingClientRect.top >= topmostEntry.boundingClientRect.top
          ) {
            continue;
          }
          topmostEntry = entry;
        }
        if (topmostEntry === null) {
          return;
        }
        const path = topmostEntry.target.getAttribute('data-file-path');
        if (path !== null) {
          setActivePath(path);
        }
      },
      { root: viewport, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    intersectionObserverRef.current = obs;
    for (const el of fileRefs.current.values()) {
      obs.observe(el);
    }
    return () => {
      obs.disconnect();
      if (intersectionObserverRef.current === obs) {
        intersectionObserverRef.current = null;
      }
    };
  }, [files]);

  const toggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      writeSidebarPref(next);
      return next;
    });
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'j' || e.key === 'k') {
        const idx = files.findIndex((f) => f.path === activePath);
        const cur = idx < 0 ? 0 : idx;
        const nextIdx = e.key === 'j' ? Math.min(cur + 1, files.length - 1) : Math.max(cur - 1, 0);
        const t = files[nextIdx];
        if (t) {
          scrollToFile(t.path);
        }
      }
    },
    [files, activePath, onClose, scrollToFile],
  );

  const openComments = useMemo(() => comments.filter((c) => c.status === 'open'), [comments]);

  const handleProposeFixes = async () => {
    if (!sessionId || openComments.length === 0 || spawning) {
      return;
    }
    setSpawning(true);
    try {
      const prompt = buildNotesPrompt(openComments);
      const fileCount = new Set(openComments.map((c) => c.filePath)).size;
      const name = `resolve notes (${fileCount}F/${openComments.length}N)`;
      const idsToConsume = openComments.map((c) => c.id);
      const agentId = await spawnAgent(sessionId, {
        name,
        provider: resolverRouting.provider,
        model: resolverRouting.model,
        effort: resolverRouting.effort,
        kindOverride: 'resolver',
        sourceKind: 'diff_comment',
        focus: 'none',
      });
      try {
        await consumeDiffComments(sessionId, idsToConsume, agentId);
      } catch (err) {
        console.error('failed to mark comments consumed', err);
      }
      void sendTurn({ sessionId, agentId, content: prompt });
    } finally {
      setSpawning(false);
    }
  };

  const handleViewAgent = async (agentId: AgentId) => {
    if (!sessionId) {
      return;
    }
    setActiveLens(sessionId, 'review');
    await selectAgent(sessionId, agentId);
    onClose();
  };

  const handleOpenInEditor = useCallback(
    async (filePath: string) => {
      if (!workingDir) {
        return;
      }
      const root = workingDir.replace(/\/$/, '');
      try {
        await openFileInWorkspace(root, `${root}/${filePath}`, editorBinary);
      } catch {}
    },
    [workingDir, editorBinary],
  );

  const handleAddComment = async (filePath: string, anchor: DiffCommentAnchor, body: string) => {
    if (!sessionId) {
      return;
    }
    await addDiffComment(sessionId, filePath, body, anchor);
  };

  const handleAddFileLevelComment = async (filePath: string, body: string) => {
    if (!sessionId) {
      return;
    }
    await addDiffComment(sessionId, filePath, body);
  };

  const registerFileRef = useCallback(({ path }: RegisterFileRefParams) => {
    const existingCallback = fileRefCallbacks.current.get(path);
    if (existingCallback !== undefined) {
      return existingCallback;
    }

    const callback: React.RefCallback<HTMLElement> = (element) => {
      const previousElement = fileRefs.current.get(path);
      if (previousElement !== undefined && previousElement !== element) {
        intersectionObserverRef.current?.unobserve(previousElement);
      }
      if (element === null) {
        fileRefs.current.delete(path);
        return;
      }

      fileRefs.current.set(path, element);
      intersectionObserverRef.current?.observe(element);
    };
    fileRefCallbacks.current.set(path, callback);
    return callback;
  }, []);

  const isEmpty = !loading && !error && files.length === 0;
  const isContentEmpty = error === null && files.length === 0;
  const verifiedFilesCount = !loading && error === null ? files.length : null;

  useEffect(() => {
    onContentEmptyChange?.(isContentEmpty);
  }, [isContentEmpty, onContentEmptyChange]);
  const isPane = presentation === 'pane';
  const isDefaultView = view.kind === 'branch';
  const mainDistance = status?.mainDistance ?? null;
  const commitsAheadOfMain =
    mainDistance != null ? distanceAhead({ distance: mainDistance }) : null;
  const commitsBehindMain =
    mainDistance != null ? distanceBehind({ distance: mainDistance }) : null;
  const commitCountLabel =
    commitsAheadOfMain != null
      ? `${commitsAheadOfMain} ${commitsAheadOfMain === 1 ? 'commit' : 'commits'}`
      : 'commit count unknown';

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col',
        isPane && 'gap-5 px-6 py-5 motion-safe:animate-studio-in',
      )}
      onKeyDown={handleKeyDown}
    >
      {isPane ? (
        <div
          data-testid="diff-pane-header"
          className={cn(
            'flex shrink-0 flex-wrap items-start justify-between gap-3',
            isContentEmpty && DIFF_CAPPED_COLUMN_CLASS,
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow}
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-xl font-semibold leading-snug text-foreground">
                {DIFF_VIEWER_PANE_COPY.title}
              </h1>
              {!loading && error === null && !isEmpty ? (
                <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                  {isGitAware ? <span>{commitCountLabel}</span> : null}
                  {commitsBehindMain != null && commitsBehindMain > 0 ? (
                    <span
                      className="text-muted-foreground/70"
                      title="Commits on main not in this branch"
                    >
                      behind main by {commitsBehindMain}
                    </span>
                  ) : null}
                  {rebase.canRebase ? (
                    <button
                      type="button"
                      onClick={() => void rebase.run()}
                      disabled={rebase.isRunning}
                      title={
                        rebase.isRunning ? 'Rebase agent is still running' : 'Rebase onto main'
                      }
                      className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-2xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <GitBranch size={11} aria-hidden />
                      Rebase
                    </button>
                  ) : null}
                  {rebase.error != null ? (
                    <span
                      role="alert"
                      className="inline-flex min-w-0 items-center gap-1 text-danger"
                      title={rebase.error}
                    >
                      <AlertTriangle size={11} aria-hidden className="shrink-0" />
                      <span className="truncate">{rebase.error}</span>
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{DIFF_VIEWER_PANE_COPY.description}</p>
          </div>
          {!isEmpty ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 pt-0.5">
              {headerActions}
              <DiffToolbar
                title={title}
                prNumber={prNumber}
                openCommentsCount={openComments.length}
                reviewedCount={files.length > 0 ? reviewedCount : null}
                filesCount={files.length}
                status={isGitAware ? status : null}
                onRefresh={isGitAware ? () => setRefreshTick((t) => t + 1) : undefined}
                refreshing={loading}
                showClose={false}
                onClose={onClose}
                presentation="actions"
                layoutToggle={<DiffLayoutToggle mode={layoutMode} onChange={setLayoutMode} />}
                resolveAction={sessionId ? <ResolveOverviewAction sessionId={sessionId} /> : null}
                viewSelector={
                  isGitAware ? (
                    <DiffViewSelector
                      view={view}
                      onChange={setView}
                      commits={commits}
                      status={status}
                      filesCount={verifiedFilesCount}
                      loading={loading}
                    />
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 pt-0.5">
              {headerActions}
              {isGitAware &&
                (isDefaultView ? (
                  <Tooltip content="Refresh git state">
                    <button
                      type="button"
                      onClick={() => setRefreshTick((tick) => tick + 1)}
                      aria-label="Refresh git state"
                      className={cn(TOOLBAR_ICON_BTN, 'disabled:opacity-50')}
                    >
                      <RefreshCw size={ICON_SIZE.row} aria-hidden />
                    </button>
                  </Tooltip>
                ) : (
                  <DiffViewSelector
                    view={view}
                    onChange={setView}
                    commits={commits}
                    status={status}
                    filesCount={files.length}
                    loading={false}
                  />
                ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {isEmpty ? (
            isGitAware ? (
              <>
                <div className="flex shrink-0 items-center gap-2 px-2.5 py-1.5">
                  <div className="flex min-w-0 flex-1 items-center">
                    <DiffViewSelector
                      view={view}
                      onChange={setView}
                      commits={commits}
                      status={status}
                      filesCount={verifiedFilesCount}
                      loading={loading}
                    />
                  </div>
                  {showToolbarClose ? (
                    <Tooltip content="Close">
                      <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className={TOOLBAR_ICON_BTN}
                      >
                        <X size={ICON_SIZE.row} />
                      </button>
                    </Tooltip>
                  ) : null}
                </div>
                <Divider className="shrink-0" />
              </>
            ) : showToolbarClose ? (
              <>
                <div className="flex shrink-0 items-center justify-end px-2.5 py-1.5">
                  <Tooltip content="Close">
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className={TOOLBAR_ICON_BTN}
                    >
                      <X size={ICON_SIZE.row} />
                    </button>
                  </Tooltip>
                </div>
                <Divider className="shrink-0" />
              </>
            ) : null
          ) : (
            <DiffToolbar
              title={title}
              prNumber={prNumber}
              openCommentsCount={openComments.length}
              reviewedCount={files.length > 0 ? reviewedCount : null}
              filesCount={files.length}
              status={isGitAware ? status : null}
              onRefresh={isGitAware ? () => setRefreshTick((t) => t + 1) : undefined}
              refreshing={loading}
              showClose={showToolbarClose}
              onClose={onClose}
              layoutToggle={<DiffLayoutToggle mode={layoutMode} onChange={setLayoutMode} />}
              resolveAction={sessionId ? <ResolveOverviewAction sessionId={sessionId} /> : null}
              viewSelector={
                isGitAware ? (
                  <DiffViewSelector
                    view={view}
                    onChange={setView}
                    commits={commits}
                    status={status}
                    filesCount={verifiedFilesCount}
                    loading={loading}
                  />
                ) : null
              }
            />
          )}
        </>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4" aria-label="Loading diff">
            {DIFF_SKELETON_CARDS.map((lines, ci) => (
              <div
                key={ci}
                className="flex flex-col overflow-hidden rounded-md border border-border-soft"
              >
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <Skeleton className="h-3 w-40 rounded" />
                  <div className="flex-1" />
                  <Skeleton className="h-3 w-10 rounded" />
                </div>
                <Divider />
                <div className="flex flex-col gap-1.5 p-3">
                  {lines.map((w, li) => (
                    <div key={li} className="flex items-center gap-3">
                      <Skeleton className="h-3 w-8 shrink-0 rounded" />
                      <Skeleton className="h-3 rounded" style={{ width: w }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <ErrorStrip
              label="the diff"
              error={new Error(error)}
              onRetry={() => setRefreshTick((t) => t + 1)}
            />
          </div>
        ) : files.length === 0 ? (
          <ScrollFade className="min-h-0 min-w-0 flex-1">
            <div className={cn(DIFF_CAPPED_COLUMN_CLASS, !isPane && 'px-6 py-5')}>
              <LensEmptyState
                tone={CONCEPT_TONE.diff}
                icon={CONCEPT_ICONS.diff}
                title={emptyStateLabel(view, isGitAware)}
                description={emptyStateBlurb(view, isGitAware) ?? ''}
              />
            </div>
          </ScrollFade>
        ) : (
          <>
            <FileRail
              files={files}
              activePath={activePath}
              onSelect={scrollToFile}
              reviewStateByPath={reviewStateByPath}
              commentCounts={openCommentsByFile}
              collapsed={sidebarCollapsed}
              onToggle={toggleSidebar}
            />
            <div ref={scrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ScrollFade className="min-h-0 min-w-0 flex-1">
                {files.slice(0, mountedCount).map((file) => (
                  <FileDiffCard
                    key={file.path}
                    file={file}
                    layoutMode={layoutMode}
                    registerRef={registerFileRef({ path: file.path })}
                    reviewState={reviewStateByPath.get(file.path) ?? 'none'}
                    onToggleReviewed={(next) => toggleReviewed(file, next)}
                    canOpenEditor={Boolean(workingDir)}
                    onOpenInEditor={() => void handleOpenInEditor(file.path)}
                    comments={commentsByFile.get(file.path) ?? []}
                    canComment={Boolean(sessionId)}
                    onAddComment={(anchor, body) => void handleAddComment(file.path, anchor, body)}
                    onAddFileLevelComment={(body) =>
                      void handleAddFileLevelComment(file.path, body)
                    }
                    onResolve={(id) => sessionId && void resolveDiffComment(sessionId, id)}
                    onReopen={(id) => sessionId && void reopenDiffComment(sessionId, id)}
                    onDelete={(id) => sessionId && void deleteDiffComment(sessionId, id)}
                    onViewAgent={(id) => void handleViewAgent(id)}
                    getAgentName={(id) => agentNameById.get(id)}
                  />
                ))}
                {mountedCount < files.length && (
                  <div className="flex flex-col gap-2 py-3">
                    <div className="flex items-center gap-2 rounded-lg border border-border-soft/60 px-3 py-2.5">
                      <Skeleton className="h-4 w-4 shrink-0 rounded" />
                      <Skeleton className="h-3 w-1/3 rounded" />
                      <Skeleton className="ml-auto h-3 w-10 rounded" />
                    </div>
                    <span className="text-center text-xs text-muted-foreground">
                      {mountedCount} / {files.length} files
                    </span>
                  </div>
                )}
              </ScrollFade>
            </div>
          </>
        )}
      </div>

      {(!isPane || !isEmpty) && sessionId && openComments.length > 0 ? (
        <NotesFooter
          openCount={openComments.length}
          spawning={spawning}
          onPropose={() => void handleProposeFixes()}
          routing={
            <RoutingPicker
              ariaLabel="Resolver routing"
              connectedProviders={connectedProviderIds}
              provider={resolverRouting.provider}
              model={resolverRouting.model}
              effort={{
                editable: true,
                value: resolverRouting.effort,
                onChange: (effort) => setResolverRouting({ ...resolverRouting, effort }),
              }}
              disabled={spawning}
              onProvider={(next) => {
                if (next === '') {
                  return;
                }
                const model = getDefaultTurnModel({ id: next });
                setResolverRouting({
                  provider: next,
                  model,
                  effort: clampEffort(model, resolverRouting.effort),
                });
              }}
              onModel={(model) =>
                setResolverRouting({
                  ...resolverRouting,
                  model,
                  effort: clampEffort(model, resolverRouting.effort),
                })
              }
            />
          }
        />
      ) : null}
    </div>
  );
};
