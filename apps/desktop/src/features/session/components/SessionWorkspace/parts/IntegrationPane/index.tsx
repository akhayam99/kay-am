import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Unlink } from 'lucide-react';
import type {
  SessionExternalTask,
  SessionExternalTaskProvider,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import { cn, CountToggle, formatError, InlineConfirm } from '@goodboy/ui';
import { LensEmptyState } from '@goodboy/ui';
import { EMPTY_ARRAY, useAppStore } from '../../../../../../store';
import { selectActiveProjectPrs } from '../../../../../../store/slices/github/activeProjectPrs';
import { ConnectIntegrationEmptyState } from '../../../../../integrations/ConnectIntegrationEmptyState';
import { resolveIntegrationConnection } from '../../../../../integrations/connection';
import { useGithubConnection } from '../../../../../integrations/github/useGithubConnection';
import {
  CONCEPT_ICONS,
  CONCEPT_TONE,
  ICON_SIZE,
} from '../../../../../../shared/components/conceptIcons';
import { GhostActionButton } from '@goodboy/ui';
import { PaneShell } from '../../../../../../shared/components/PaneShell';
import { FocusedPane } from '../../../../../../shared/components/PaneShell/FocusedPane';
import { PANE_RHYTHM } from '@goodboy/ui';
import { useSessionRepo } from '../../../../../../store/slices/worktrees/useSessionRepo';
import { branchRequests } from '../../../../branchRequests';
import { buildWorkItems } from '../../../../workItems';
import { FocusedTaskBody } from './FocusedTaskBody';
import { integrationTaskKey } from './integrationTaskKey';
import { LinkTicketPopover } from './LinkTicketPopover';
import { WorkItemList } from './WorkItemList';
import { useSessionProjectScope } from '../../../../hooks/useSessionProjectScope';

type Props = {
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly provider: Exclude<SessionExternalTaskProvider, 'github' | 'sentry'>;
  readonly eyebrow?: ReactNode;
};

type ProviderMeta = Readonly<{
  label: string;
  noun: string;
  nounPhrase: string;
  nounPlural: string;
  linkHint: string;
}>;

type UnlinkParams = {
  readonly task: SessionExternalTask;
};

const PROVIDER_META: Record<SessionExternalTaskProvider, ProviderMeta> = {
  linear: {
    label: 'Linear',
    noun: 'issue',
    nounPhrase: 'an issue',
    nounPlural: 'issues',
    linkHint: 'Search your assigned Linear issues or paste a URL to link one to this session.',
  },
  sentry: {
    label: 'Sentry',
    noun: 'issue',
    nounPhrase: 'an issue',
    nounPlural: 'issues',
    linkHint: 'Search your assigned Sentry issues or paste a URL to link one to this session.',
  },
  gitlab: {
    label: 'GitLab',
    noun: 'issue',
    nounPhrase: 'an issue',
    nounPlural: 'issues',
    linkHint: 'Search your assigned GitLab issues or paste a URL to link one to this session.',
  },
  jira: {
    label: 'Jira',
    noun: 'issue',
    nounPhrase: 'an issue',
    nounPlural: 'issues',
    linkHint: 'Search your assigned Jira issues or paste a URL to link one to this session.',
  },
  github: {
    label: 'GitHub',
    noun: 'issue',
    nounPhrase: 'an issue',
    nounPlural: 'issues',
    linkHint: 'Search your assigned GitHub issues or paste a URL to link one to this session.',
  },
  bitbucket: {
    label: 'Bitbucket',
    noun: 'pull request',
    nounPhrase: 'a pull request',
    nounPlural: 'pull requests',
    linkHint: 'Paste a Bitbucket pull request URL to link one to this session.',
  },
  slack: {
    label: 'Slack',
    noun: 'thread',
    nounPhrase: 'a thread',
    nounPlural: 'threads',
    linkHint: 'Pick a thread from a channel you are in, or paste a Slack permalink to link one.',
  },
};

export const IntegrationPane = ({ sessionId, workspaceId, provider, eyebrow }: Props) => {
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isUnlinkArmed, setIsUnlinkArmed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const externalTasks = useAppStore(
    (state) => state.sessionExternalTasks[sessionId] ?? EMPTY_ARRAY,
  );
  const openedTask = useAppStore((state) => state.focusedExternalTask[sessionId] ?? null);
  const openedTaskKey =
    openedTask?.provider === provider ? integrationTaskKey({ task: openedTask }) : null;
  const [focusedTaskKey, setFocusedTaskKey] = useState<string | null>(openedTaskKey);
  useEffect(() => {
    if (openedTaskKey == null) {
      return;
    }
    setFocusedTaskKey(openedTaskKey);
  }, [openedTaskKey]);
  const unlinkSessionExternalTask = useAppStore((state) => state.unlinkSessionExternalTask);
  const integrations = useAppStore(
    (state) => state.workspaceIntegrations[workspaceId] ?? EMPTY_ARRAY,
  );
  const githubConnection = useGithubConnection({ workspaceId });
  const sessionBranch = useSessionRepo({ sessionId })?.branch ?? null;
  const projectScope = useSessionProjectScope({ sessionId });
  const branchPrs = useAppStore((state) => selectActiveProjectPrs({ state, sessionId }));
  const mergeRequest = useAppStore((state) => state.sessionGitlabMr[sessionId]?.mr ?? null);
  const tasks = useMemo(
    () => externalTasks.filter((task) => task.provider === provider),
    [externalTasks, provider],
  );
  const meta = PROVIDER_META[provider];
  const connection = resolveIntegrationConnection({
    provider,
    integrations,
    externalTasks,
    isGithubAuthenticated:
      githubConnection.isResolved === false || githubConnection.isAuthenticated,
  });
  const hasTasks = tasks.length > 0;
  const linkAction = (
    <LinkTicketPopover
      sessionId={sessionId}
      workspaceId={workspaceId}
      provider={provider}
      providerLabel={meta.label}
      noun={meta.noun}
      nounPhrase={meta.nounPhrase}
      nounPlural={meta.nounPlural}
    />
  );
  const focusedTask = tasks.find((task) => integrationTaskKey({ task }) === focusedTaskKey) ?? null;
  const workItems = buildWorkItems({
    tasks,
    currentBranch: sessionBranch,
    branchPrs: branchRequests({ prs: branchPrs, mr: mergeRequest, branch: sessionBranch }),
  });

  const handleUnlink = async ({ task }: UnlinkParams) => {
    const projectId = task.projectId;
    setUnlinkError(null);
    setIsUnlinking(true);
    try {
      const unlink =
        projectId == null
          ? () => unlinkSessionExternalTask(sessionId, provider, task.externalId)
          : () => unlinkSessionExternalTask(sessionId, provider, task.externalId, projectId);
      await unlink();
      setIsUnlinkArmed(false);
      setFocusedTaskKey(null);
    } catch (error) {
      setUnlinkError(formatError(error));
    } finally {
      setIsUnlinking(false);
    }
  };

  if (focusedTask != null) {
    return (
      <FocusedPane
        lens={meta.label}
        count={tasks.length}
        eyebrow={eyebrow}
        actions={
          isUnlinkArmed ? (
            <InlineConfirm
              role="danger"
              className="max-w-sm"
              icon={<Unlink size={ICON_SIZE.row} aria-hidden />}
              title={`Unlink ${focusedTask.identifier}?`}
              description={`Removes the ${meta.label} ${meta.noun} from this session without changing the ${meta.noun}.`}
              confirmLabel={`Unlink ${focusedTask.identifier}`}
              autoDisarmMs={4000}
              isBusy={isUnlinking}
              onConfirm={() => handleUnlink({ task: focusedTask })}
              onCancel={() => setIsUnlinkArmed(false)}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <GhostActionButton
                icon={ArrowLeft}
                label={`All ${meta.nounPlural}`}
                onClick={() => setFocusedTaskKey(null)}
              />
              <GhostActionButton
                icon={Unlink}
                tone="danger"
                label="Unlink"
                ariaLabel={`Unlink ${focusedTask.identifier}`}
                disabled={isUnlinking}
                onClick={() => setIsUnlinkArmed(true)}
              />
              {linkAction}
            </div>
          )
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {unlinkError != null ? (
            <p className={cn('shrink-0 pt-3 text-xs text-danger', PANE_RHYTHM.inset)}>
              {unlinkError}
            </p>
          ) : null}
          <FocusedTaskBody
            provider={provider}
            sessionId={sessionId}
            workspaceId={workspaceId}
            task={focusedTask}
            projectId={focusedTask.projectId ?? projectScope}
            isConnected={connection.isConnected}
          />
        </div>
      </FocusedPane>
    );
  }

  return (
    <PaneShell
      title={meta.label}
      description={`External ${meta.label} ${meta.nounPlural} linked to this session.`}
      meta={hasTasks ? tasks.length : undefined}
      eyebrow={eyebrow}
      actions={connection.isConnected && hasTasks ? linkAction : undefined}
    >
      {!connection.isConnected ? (
        <ConnectIntegrationEmptyState provider={provider} workspaceId={workspaceId} compact />
      ) : null}
      {connection.isConnected && !hasTasks ? (
        <LensEmptyState
          icon={CONCEPT_ICONS.integrations}
          tone={CONCEPT_TONE.integrations}
          title={`No ${meta.label} ${meta.nounPlural} linked`}
          description={meta.linkHint}
          action={linkAction}
        />
      ) : null}
      <WorkItemList
        items={workItems.current}
        providerLabel={meta.label}
        onSelect={setFocusedTaskKey}
      />
      <div className="flex justify-center">
        <CountToggle
          label="completed"
          count={workItems.history.length}
          isShown={showHistory}
          icon={Check}
          onChange={setShowHistory}
        />
      </div>
      {showHistory && workItems.history.length > 0 ? (
        <WorkItemList
          items={workItems.history}
          providerLabel={meta.label}
          onSelect={setFocusedTaskKey}
        />
      ) : null}
      {unlinkError != null ? <p className="text-xs text-danger">{unlinkError}</p> : null}
    </PaneShell>
  );
};
