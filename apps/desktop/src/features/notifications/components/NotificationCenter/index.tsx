import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronRight, RotateCcw, Trash2, X } from 'lucide-react';
import {
  AnchoredPopover,
  cn,
  Divider,
  EmptyState,
  ScrollFade,
  Skeleton,
  tintClasses,
  Tooltip,
  useDropdown,
} from '@goodboy/ui';
import { useShallow } from 'zustand/react/shallow';
import type { Notification, NotificationAction } from '@goodboy/db';
import { PROVIDER_CAPABILITIES, resolveTaskModel } from '@goodboy/core';
import type { ModelEffort, ProviderId, TaskModelPreference } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { mapNotificationAction } from '../NotificationToastBridge';
import { RoutingPicker } from '../../../../shared/components/RoutingPicker';
import { CONCEPT_ICONS, CONCEPT_TONE, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { stripInlineMarkdown } from '../../../../shared/components/InlineMarkdown/stripInlineMarkdown';
import { formatRelativeAge } from '../../../../shared/utils/relativeDate';
import { NOTIFICATIONS_STUDIO_EVENT } from '../../studioEvent';
import { sendNotificationToDevelopers } from '../../../settings/sendNotificationToDevelopers';
import { groupNotifications } from '../../grouping';

const DROPDOWN_WIDTH = 384;
const LIST_MAX_HEIGHT = 400;
const HEADER_HEIGHT = 37;
const DROPDOWN_MAX_HEIGHT = LIST_MAX_HEIGHT + HEADER_HEIGHT;
const OPEN_EVENT = 'goodboy:open-notifications';

export const NotificationCenter = () => {
  const notifications = useAppStore((s) => s.notifications);
  const notificationsLoading = useAppStore((s) => s.notificationsLoading);
  const loadNotifications = useAppStore((s) => s.loadNotifications);
  const markNotificationsRead = useAppStore((s) => s.markNotificationsRead);
  const clearNotifications = useAppStore((s) => s.clearNotifications);
  const dismissNotification = useAppStore((s) => s.dismissNotification);
  const markNotificationRead = useAppStore((s) => s.markNotificationRead);
  const dropdown = useDropdown({
    align: 'center',
    width: 'w-96',
    expectedWidth: DROPDOWN_WIDTH,
    expectedHeight: DROPDOWN_MAX_HEIGHT,
    openEvent: OPEN_EVENT,
    isEscapeEnabled: false,
  });
  const { open, close, toggle } = dropdown;
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const handleOpenRequest = () => {
      if (openRef.current) {
        return;
      }
      void markNotificationsRead();
    };
    window.addEventListener(OPEN_EVENT, handleOpenRequest);
    return () => {
      window.removeEventListener(OPEN_EVENT, handleOpenRequest);
    };
  }, [markNotificationsRead]);

  const handleOpen = () => {
    toggle();
    if (!open) {
      void markNotificationsRead();
    }
  };

  const groups = groupNotifications({ notifications });
  const total = groups.length;
  const unread = groups.filter((group) => group.some((notification) => !notification.read)).length;

  return (
    <div role="region" aria-label="Notifications" aria-live="polite">
      <AnchoredPopover
        dropdown={dropdown}
        hasBackdrop
        trigger={
          <Tooltip content="notifications" side="top">
            <button
              type="button"
              onClick={handleOpen}
              className={cn(
                'relative flex items-center justify-center rounded p-1.5 motion-safe:transition-colors',
                open
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
            >
              <Bell size={ICON_SIZE.control} aria-hidden />
              {unread > 0 && (
                <span
                  className={cn(
                    'absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-warning px-1 font-bold leading-none text-warning-foreground tabular-nums',
                    unread > 9 ? 'text-3xs' : 'text-2xs',
                  )}
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          </Tooltip>
        }
      >
        <header className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-xs font-semibold text-foreground">
            {unread > 0
              ? `${unread} unread · ${total} total`
              : `${total} ${total === 1 ? 'notification' : 'notifications'}`}
          </span>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => void clearNotifications()}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              aria-label="Clear all notifications"
              title="Clear all notifications"
            >
              <Trash2 size={11} aria-hidden />
              Clear all
            </button>
          )}
        </header>
        <Divider />
        {notificationsLoading && notifications.length === 0 ? (
          <div
            className="flex flex-col gap-3 px-3 py-2.5"
            role="status"
            aria-label="Loading notifications"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-start gap-2">
                <Skeleton className="mt-0.5 size-3.5 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-2/3 rounded" />
                  <Skeleton className="h-2.5 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            tone={CONCEPT_TONE.notifications}
            title="No notifications"
            description="Run activity and alerts land here."
            size="inline"
            className="px-3 py-6"
          />
        ) : (
          <ScrollFade className="max-h-[25rem]" fadeSize={16} fadeFrom="elevated">
            <ul>
              {groups.map((group) => (
                <NotificationGroup
                  key={group[0]?.coalesceKey ?? group[0]?.id}
                  notifications={group}
                  onNavigated={close}
                  onDismiss={() => {
                    for (const notification of group) {
                      void markNotificationRead(notification.id);
                      void dismissNotification(notification.id);
                    }
                  }}
                />
              ))}
            </ul>
          </ScrollFade>
        )}
      </AnchoredPopover>
    </div>
  );
};

type NotificationGroupProps = {
  readonly notifications: ReadonlyArray<Notification>;
  readonly onNavigated: () => void;
  readonly onDismiss: () => void;
};

const NotificationGroup = ({ notifications, onNavigated, onDismiss }: NotificationGroupProps) => {
  const n = notifications[0];
  if (n == null) {
    return null;
  }
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const setCurrentWorkspace = useAppStore((s) => s.setCurrentWorkspace);
  const setActiveLens = useAppStore((s) => s.setActiveLens);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const store = useAppStore.getState();
  const action = n.action != null ? mapNotificationAction(n.action, store) : undefined;
  const retryAction =
    n.action?.kind === 'retry-summarizer' || n.action?.kind === 'retry-step-summary'
      ? n.action
      : null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sessionId = n.sessionId;
  const agentId = n.action?.kind === 'retry-step-summary' ? n.action.agentId : null;
  const canSendToDevelopers = n.severity === 'warning' || n.severity === 'error';

  const isUnread = notifications.some((notification) => !notification.read);
  const sessionGoal = useAppStore(
    (s) => s.sessions.find((session) => session.id === n.sessionId)?.goal,
  );
  const source = sessionGoal == null ? 'Goodboy' : stripInlineMarkdown({ text: sessionGoal });
  const border =
    n.severity === 'error'
      ? 'border-l-danger/40'
      : n.severity === 'warning'
        ? 'border-l-warning/40'
        : 'border-l-transparent';
  const ConceptIcon = CONCEPT_ICONS.notifications;

  const navigate = () => {
    if (sessionId == null) {
      return;
    }
    const workspaceId = n.workspaceId;
    void (async () => {
      if (workspaceId != null && workspaceId !== useAppStore.getState().currentWorkspaceId) {
        await setCurrentWorkspace(workspaceId);
      }
      const state = useAppStore.getState();
      if (!state.sessions.some((candidate) => candidate.id === sessionId)) {
        return;
      }
      if (state.currentSessionId === sessionId) {
        setActiveLens(sessionId, null);
      } else {
        await setCurrentSession(sessionId);
      }
      if (agentId == null) {
        return;
      }
      await selectAgent(sessionId, agentId);
    })().catch(() => {});
    onNavigated();
  };

  return (
    <li className={cn('group flex flex-col gap-1 border-l-2 px-3 py-2', border)}>
      <div className="flex items-center gap-2">
        {notifications.length > 1 ? (
          <Tooltip content={expanded ? 'Collapse the group' : 'Expand the group'}>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? 'Collapse notifications' : 'Expand notifications'}
              aria-expanded={expanded}
            >
              <ChevronRight
                size={ICON_SIZE.row}
                className={cn('transition-transform', expanded && 'rotate-90')}
              />
            </button>
          </Tooltip>
        ) : null}
        <ConceptIcon
          size={ICON_SIZE.control}
          className={tintClasses(CONCEPT_TONE.notifications).icon}
          aria-hidden
        />
        {notifications.length === 1 && sessionId != null ? (
          <button type="button" onClick={navigate} className="min-w-0 flex-1 truncate text-left">
            <span
              className={cn(
                'text-xs',
                isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {n.title}
            </span>
          </button>
        ) : (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {n.title}
          </span>
        )}
        {notifications.length > 1 ? (
          <span className="rounded-full bg-muted px-1.5 text-3xs tabular-nums text-muted-foreground">
            {notifications.length}
          </span>
        ) : null}
        <span className="text-3xs text-muted-foreground tabular-nums">
          {formatRelativeAge({ fromIso: n.ts })}
        </span>
        <span className="hidden items-center gap-0.5 group-hover:flex">
          {action != null ? (
            <Tooltip content="Retry">
              <button
                type="button"
                className="rounded p-1 hover:bg-muted"
                onClick={action.onClick}
                aria-label="Retry"
              >
                <RotateCcw size={11} />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip content="Dismiss the group">
            <button
              type="button"
              className="rounded p-1 hover:bg-muted"
              onClick={onDismiss}
              aria-label="Dismiss group"
            >
              <X size={11} />
            </button>
          </Tooltip>
        </span>
      </div>
      <span className="truncate pl-5 text-2xs text-muted-foreground">{source}</span>
      {expanded ? (
        <div className="flex flex-col gap-2 border-l border-border-soft pl-3">
          {notifications.slice(0, 5).map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                <span>{formatRelativeAge({ fromIso: entry.ts })}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {entry.action != null &&
                mapNotificationAction(entry.action, useAppStore.getState()) != null ? (
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-2xs hover:bg-muted"
                    onClick={mapNotificationAction(entry.action, useAppStore.getState())?.onClick}
                  >
                    Retry
                  </button>
                ) : null}
                {entry.action?.kind === 'retry-summarizer' ||
                entry.action?.kind === 'retry-step-summary' ? (
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-2xs hover:bg-muted"
                    onClick={() => setPickerOpen((value) => !value)}
                  >
                    Retry with…
                  </button>
                ) : null}
                {canSendToDevelopers ? (
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-2xs hover:bg-muted"
                    onClick={() => sendNotificationToDevelopers({ notification: entry })}
                  >
                    Send to developers
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {pickerOpen && retryAction != null ? (
            <RetryWithPicker action={retryAction} onDone={() => setPickerOpen(false)} />
          ) : null}
          <button
            type="button"
            className="text-left text-2xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              onNavigated();
              window.dispatchEvent(new CustomEvent(NOTIFICATIONS_STUDIO_EVENT));
            }}
          >
            View all in studio
          </button>
        </div>
      ) : null}
    </li>
  );
};

type RetryAction = Extract<
  NotificationAction,
  { kind: 'retry-summarizer' } | { kind: 'retry-step-summary' }
>;

type RetryWithPickerProps = {
  readonly action: RetryAction;
  readonly onDone: () => void;
};

const RetryWithPicker = ({ action, onDone }: RetryWithPickerProps) => {
  const connectedProviderIds = useAppStore(
    useShallow((s) => s.providers.filter((p) => p.connection === 'connected').map((p) => p.id)),
  );
  const sessionProvider = useAppStore(
    (s) => s.sessions.find((x) => x.id === action.sessionId)?.providerPreference.defaultProvider,
  );
  const availableProviderIds = connectedProviderIds.filter(
    (candidate) => PROVIDER_CAPABILITIES[candidate].models.length > 0,
  );
  const initialProvider =
    sessionProvider != null && availableProviderIds.includes(sessionProvider)
      ? sessionProvider
      : availableProviderIds[0];
  const [providerId, setProviderId] = useState<ProviderId | undefined>(initialProvider);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState<ModelEffort>('medium');
  if (providerId == null) {
    return null;
  }
  const recommendedModel = resolveTaskModel({
    task: 'summarizer',
    preferences: null,
    workspaceDefaultProviderId: providerId,
    sessionDefaultProviderId: providerId,
  }).model;
  const dispatch = () => {
    const taskModel =
      model === ''
        ? resolveTaskModel({
            task: 'summarizer',
            preferences: null,
            workspaceDefaultProviderId: providerId,
            sessionDefaultProviderId: providerId,
          })
        : { providerId, model };
    const override: TaskModelPreference = { ...taskModel, effort };
    const store = useAppStore.getState();
    switch (action.kind) {
      case 'retry-summarizer':
        store.retrySummarizer(action.sessionId, override);
        break;
      case 'retry-step-summary':
        void store.retryStepSummary({
          sessionId: action.sessionId,
          agentId: action.agentId,
          taskModelOverride: override,
        });
        break;
      default: {
        const _exhaustive: never = action;
        return _exhaustive;
      }
    }
    onDone();
  };
  return (
    <div className="flex items-center gap-1.5 pt-1.5">
      <div className="min-w-0 flex-1">
        <RoutingPicker
          ariaLabel="Retry routing"
          connectedProviders={availableProviderIds}
          provider={providerId}
          model={model}
          effort={{ editable: true, value: effort, onChange: setEffort }}
          recommendation={{ model: recommendedModel }}
          disabled={false}
          onProvider={(next) => {
            if (next === '') {
              return;
            }
            setProviderId(next);
            setModel('');
          }}
          onModel={setModel}
        />
      </div>
      <button
        type="button"
        className="rounded px-1.5 py-0.5 text-2xs font-medium text-foreground/80 ring-1 ring-inset ring-foreground/20 hover:bg-muted hover:text-foreground"
        onClick={dispatch}
        aria-label="Confirm retry with selected model"
      >
        Retry
      </button>
    </div>
  );
};
