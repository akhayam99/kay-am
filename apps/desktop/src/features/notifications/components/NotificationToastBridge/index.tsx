import { useEffect, useRef } from 'react';
import type { Notification, NotificationAction } from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type { Session, Workspace } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { useToast, type ToastAction } from '../../../../app/components/Toast';
import { stripInlineMarkdown } from '../../../../shared/components/InlineMarkdown/stripInlineMarkdown';
import type { ImpactScope } from '../../../impact/lib';
import { openImpactStudio } from '../../../impact/openImpactStudio';

export const pickFreshFailures = (
  notifications: ReadonlyArray<Notification>,
  seen: Set<string>,
  since: number,
): ReadonlyArray<Notification> => {
  const out: Array<Notification> = [];
  for (const n of notifications) {
    if (seen.has(n.id)) {
      continue;
    }
    seen.add(n.id);
    if (new Date(n.ts).getTime() < since) {
      continue;
    }
    if (n.severity !== 'error' && n.severity !== 'warning') {
      continue;
    }
    out.push(n);
  }
  return out;
};

export const notificationContext = (
  n: Notification,
  sessions: ReadonlyArray<Session>,
  workspaces: ReadonlyArray<Workspace>,
): string | undefined => {
  const parts: Array<string> = [];
  const ws = n.workspaceId ? workspaces.find((w) => w.id === n.workspaceId) : undefined;
  if (ws) {
    parts.push(ws.name);
  }
  const session = n.sessionId ? sessions.find((s) => s.id === n.sessionId) : undefined;
  if (session) {
    parts.push(stripInlineMarkdown({ text: session.goal }).trim() || 'untitled session');
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
};

export const mapNotificationAction = (
  action: NotificationAction,
  store: ReturnType<typeof useAppStore.getState>,
): ToastAction | undefined => {
  if (action.kind === 'retry-summarizer') {
    const { sessionId } = action;
    const lastAttempt = store.summarizerStatus[sessionId]?.lastAttempt;
    if (lastAttempt == null) {
      return undefined;
    }
    return {
      label: 'Retry',
      onClick: () => {
        store.retrySummarizer(sessionId);
      },
    };
  }
  if (action.kind === 'retry-step-summary') {
    const { sessionId, agentId } = action;
    return {
      label: 'Retry',
      onClick: () => {
        void store.retryStepSummary({ sessionId, agentId });
      },
    };
  }
  if (action.kind === 'open-agent') {
    const { sessionId, agentId } = action;
    return {
      label: 'Open agent',
      onClick: () => {
        void (async () => {
          await store.setCurrentSession(sessionId);
          store.setActiveLens(sessionId, 'agents');
          await store.selectAgent(sessionId, agentId);
          window.dispatchEvent(new CustomEvent('goodboy:reveal-chat'));
        })().catch(() => undefined);
      },
    };
  }
  if (action.kind === 'open-budget') {
    const scope: ImpactScope =
      action.sessionId != null
        ? { kind: 'session', sessionId: action.sessionId }
        : { kind: 'overview' };
    return {
      label: 'Open spend',
      onClick: () => {
        openImpactStudio({ scope });
      },
    };
  }
  if (action.kind === 'retry-push-resolutions') {
    const { sessionId } = action;
    return {
      label: 'Retry',
      onClick: () => {
        void (async () => {
          const preview = await store.retryPublication({ sessionId });
          if (preview.publicationId === null) {
            return;
          }
          await store.publishConversations({
            sessionId,
            publicationId: preview.publicationId,
          });
        })().catch((err: unknown) => {
          void store.emitNotification(
            'error',
            'error',
            'retry failed, comments left unresolved',
            formatError(err),
            { sessionId },
          );
        });
      },
    };
  }
  if (action.kind === 'open-orphan-worktrees') {
    const { workspaceId } = action;
    return {
      label: 'Review folders',
      onClick: () => {
        void store.setCurrentWorkspace(workspaceId).then(() => {
          window.dispatchEvent(
            new CustomEvent('goodboy:open-settings', {
              detail: { scope: 'workspace', section: 'orphans' },
            }),
          );
        });
      },
    };
  }
  const _exhaustive: never = action;
  return undefined;
};

export const NotificationToastBridge = () => {
  const notifications = useAppStore((s) => s.notifications);
  const sessions = useAppStore((s) => s.sessions);
  const workspaces = useAppStore((s) => s.workspaces);
  const { showToast } = useToast();

  const seen = useRef<Set<string>>(new Set());
  const mountedAt = useRef<number>(Date.now());

  useEffect(() => {
    for (const n of pickFreshFailures(notifications, seen.current, mountedAt.current)) {
      const store = useAppStore.getState();
      const toastAction = n.action != null ? mapNotificationAction(n.action, store) : undefined;
      showToast(n.severity === 'error' ? 'error' : 'warning', n.body ?? '', {
        title: n.title,
        context: notificationContext(n, sessions, workspaces),
        persist: n.severity === 'error',
        action: toastAction,
      });
    }
  }, [notifications, sessions, workspaces, showToast]);

  return null;
};
