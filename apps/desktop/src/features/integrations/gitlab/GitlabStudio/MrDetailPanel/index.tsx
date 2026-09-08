import {
  RecordDetailEmptyState,
  RecordDetailHeader,
  StudioDetailLayout,
} from '../../../../../shared/components/StudioDetail';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, formatError, Markdown } from '@goodboy/ui';
import { AlertTriangle, FileText, GitBranch, GitMerge, MessageSquare } from 'lucide-react';
import type { GitlabIntegrationBinding, SessionId, WorkspaceId } from '@goodboy/types';
import { StudioWidget, HeaderBand, StudioDetailTabs } from '@goodboy/ui';
import { gitlabMergeRequestFields, resolveDetailFields } from '../../../../../shared/detail-fields';
import { StateBadge } from '@goodboy/ui';
import { BranchPair } from '@goodboy/ui';
import { RefreshIconButton } from '@goodboy/ui';
import { useAppStore } from '../../../../../store';
import { useToast } from '../../../../../app/components/Toast';
import {
  gitlabMergeMr,
  gitlabUpdateMrState,
  type GitlabMergeRequest,
  type GitlabMrStateEvent,
} from '../../client';
import { useGitlabMrApprovals } from '../../useGitlabMrApprovals';
import { useGitlabMrDiscussions } from '../../useGitlabMrDiscussions';
import { projectPathFromMrUrl } from '../useGitlabMrs';
import { CreateMrForm } from './CreateMrForm';
import { MrActionBar, type MrActionBusy } from './MrActionBar';
import { MrApprovalRail } from './MrApprovalRail';
import { MrConversation } from './MrConversation';
import { mrDraftTitle } from './mrDraftTitle';
import { mergeRequestStateTone } from '../../stateTone';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type MrSection = 'overview' | 'conversation';

type Busy = 'merge' | MrActionBusy;

type UpdateParams = {
  readonly kind: Exclude<MrActionBusy, null>;
  readonly toast: string;
  readonly stateEvent?: GitlabMrStateEvent;
  readonly title?: string;
};

type Props = {
  readonly sessionId?: SessionId | null;
  readonly mr?: GitlabMergeRequest | null;
  readonly workspaceId?: WorkspaceId;
  readonly host?: string | null;
  readonly onRefresh?: () => void;
  readonly onClose: () => void;
  readonly headerActions?: ReactNode;
  readonly dock?: ReactNode;
};

const SECTION_OPTIONS = [
  { value: 'overview', label: 'Overview', icon: FileText },
  { value: 'conversation', label: 'Conversation', icon: MessageSquare },
] as const;

export const MrDetailPanel = ({
  sessionId = null,
  mr: selectedMr = null,
  workspaceId,
  host,
  onRefresh,
  onClose,
  headerActions,
  dock,
}: Props) => {
  const session = useAppStore((s) =>
    sessionId == null ? null : (s.sessions.find((x) => x.id === sessionId) ?? null),
  );
  const mrState = useAppStore((s) =>
    sessionId == null ? undefined : s.sessionGitlabMr[sessionId],
  );
  const sessionBranch = useAppStore((s) =>
    sessionId == null ? null : (s.sessionBranches[sessionId] ?? null),
  );
  const refreshSessionMr = useAppStore((s) => s.refreshSessionMr);
  const mergeMrForSession = useAppStore((s) => s.mergeMrForSession);
  const activeWorkspaceId = workspaceId ?? session?.workspaceId ?? null;
  const integrationHost = useAppStore((s) => {
    if (activeWorkspaceId == null) {
      return null;
    }
    const integration = s.workspaceIntegrations?.[activeWorkspaceId]?.find(
      (candidate): candidate is GitlabIntegrationBinding => candidate.provider === 'gitlab',
    );
    return integration?.config.host ?? null;
  });
  const { showToast } = useToast();

  const [localMr, setLocalMr] = useState<GitlabMergeRequest | null>(null);
  const [section, setSection] = useState<MrSection>('overview');
  const [busy, setBusy] = useState<Busy>(null);

  const storeMr = mrState?.mr ?? null;
  const mr = localMr ?? selectedMr ?? storeMr;
  const projectPath = mr == null ? null : projectPathFromMrUrl({ webUrl: mr.webUrl });
  const branch = selectedMr?.sourceBranch ?? sessionBranch;
  const loading = mrState?.loading ?? false;
  const error = mrState?.error ?? null;
  const activeHost = host ?? integrationHost;
  const canAct =
    activeWorkspaceId != null && activeHost != null && projectPath != null && mr != null;

  const discussions = useGitlabMrDiscussions({
    workspaceId: canAct ? activeWorkspaceId : null,
    host: canAct ? activeHost : null,
    projectPath: canAct ? projectPath : null,
    mrIid: canAct ? mr.iid : null,
  });
  const approvals = useGitlabMrApprovals({
    workspaceId: canAct ? activeWorkspaceId : null,
    host: canAct ? activeHost : null,
    projectPath: canAct ? projectPath : null,
    mrIid: canAct ? mr.iid : null,
  });

  useEffect(() => {
    if (sessionId == null) {
      return;
    }
    void refreshSessionMr(sessionId, { silent: true });
  }, [sessionId, refreshSessionMr]);

  useEffect(() => {
    setLocalMr(null);
  }, [selectedMr, storeMr]);

  if (sessionId != null && session == null) {
    return (
      <RecordDetailEmptyState
        provider="gitlab"
        title="No session selected"
        description="Pick a session to manage its merge request."
      />
    );
  }

  if (sessionId == null && mr == null) {
    return (
      <RecordDetailEmptyState
        provider="gitlab"
        title="No merge request selected"
        description="Pick a merge request to see its details."
      />
    );
  }

  const onMerge = async () => {
    if (busy !== null) {
      return;
    }
    setBusy('merge');
    try {
      if (sessionId != null) {
        await mergeMrForSession({ sessionId });
      } else if (mr != null && workspaceId != null && host != null && projectPath != null) {
        await gitlabMergeMr(workspaceId, host, projectPath, mr.iid);
        onRefresh?.();
      }
      showToast('success', 'Merge request merged');
      onClose();
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusy(null);
    }
  };

  const runUpdate = async ({ kind, toast, stateEvent, title }: UpdateParams) => {
    if (busy !== null || mr == null || activeWorkspaceId == null || activeHost == null) {
      return;
    }
    if (projectPath == null) {
      return;
    }
    setBusy(kind);
    try {
      const updated = await gitlabUpdateMrState({
        workspaceId: activeWorkspaceId,
        host: activeHost,
        projectPath,
        mrIid: mr.iid,
        ...(stateEvent !== undefined && { stateEvent }),
        ...(title !== undefined && { title }),
      });
      setLocalMr(updated);
      if (sessionId != null) {
        void refreshSessionMr(sessionId, { force: true });
      }
      onRefresh?.();
      showToast('success', toast);
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusy(null);
    }
  };

  const refreshButton = (
    <RefreshIconButton
      label="refresh merge request"
      iconSize={12}
      isLoading={loading}
      error={error}
      onClick={() => {
        discussions.reload();
        if (sessionId != null) {
          void refreshSessionMr(sessionId, { force: true });
          return;
        }
        onRefresh?.();
      }}
    />
  );

  if (mr != null) {
    const actionBusy: MrActionBusy =
      busy === 'draft' || busy === 'close' || busy === 'reopen' ? busy : null;
    const postNote = discussions.post;

    return (
      <StudioDetailLayout
        header={
          <>
            <RecordDetailHeader
              provider="gitlab"
              identifier={`!${mr.iid}`}
              title={mr.title}
              badge={
                <>
                  <StateBadge tone={mergeRequestStateTone({ state: mr.state })}>
                    {mr.state}
                  </StateBadge>
                  {mr.draft ? <StateBadge tone="warning">draft</StateBadge> : null}
                </>
              }
              subtitle={<BranchPair headBranch={mr.sourceBranch} baseBranch={mr.targetBranch} />}
              actions={
                <>
                  {refreshButton}
                  {mr.state === 'opened' ? (
                    <Button
                      onClick={() => void onMerge()}
                      disabled={
                        busy !== null ||
                        mr.hasConflicts ||
                        mr.mergeStatus === 'cannot_be_merged' ||
                        (sessionId == null && projectPath == null)
                      }
                      className={busy === 'merge' ? 'animate-border-pulse' : undefined}
                    >
                      {busy === 'merge' ? (
                        'Merging…'
                      ) : (
                        <>
                          <GitMerge size={ICON_SIZE.row} aria-hidden />
                          Merge request
                        </>
                      )}
                    </Button>
                  ) : null}
                  {headerActions}
                </>
              }
              externalRef={{ url: mr.webUrl, label: 'MR' }}
            />
            <MrActionBar
              mr={mr}
              busy={actionBusy}
              approval={approvals.approval}
              isApprovalBusy={approvals.isSubmitting}
              isSupported={approvals.isSupported}
              approvalError={approvals.error}
              canAct={canAct}
              onApprove={approvals.approve == null ? null : () => void approvals.approve?.()}
              onUnapprove={approvals.unapprove == null ? null : () => void approvals.unapprove?.()}
              onToggleDraft={() =>
                void runUpdate({
                  kind: 'draft',
                  toast: mr.draft ? 'Merge request marked ready' : 'Merge request back to draft',
                  title: mrDraftTitle({ title: mr.title, isDraft: !mr.draft }),
                })
              }
              onClose={() =>
                void runUpdate({
                  kind: 'close',
                  toast: 'Merge request closed',
                  stateEvent: 'close',
                })
              }
              onReopen={() =>
                void runUpdate({
                  kind: 'reopen',
                  toast: 'Merge request reopened',
                  stateEvent: 'reopen',
                })
              }
            />
          </>
        }
        tabs={
          <StudioDetailTabs
            ariaLabel="Merge request sections"
            options={SECTION_OPTIONS}
            value={section}
            onChange={setSection}
          />
        }
        rail={
          <MrApprovalRail
            approval={approvals.approval}
            isLoading={approvals.isLoading}
            error={approvals.error}
          />
        }
        properties={resolveDetailFields({ registry: gitlabMergeRequestFields, entity: mr })}
        dock={dock}
      >
        {mr.hasConflicts ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-2xs leading-relaxed text-foreground">
            <AlertTriangle
              size={ICON_SIZE.row}
              aria-hidden
              className="mt-0.5 shrink-0 text-warning"
            />
            <span>This merge request has conflicts that must be resolved before merging.</span>
          </div>
        ) : null}

        {section === 'overview' ? (
          <StudioWidget presentation="section" label="description" variant="frameless">
            {mr.description != null && mr.description !== '' ? (
              <Markdown text={mr.description} className="text-sm leading-relaxed" />
            ) : (
              <p className="text-sm italic text-muted-foreground/60">No description.</p>
            )}
          </StudioWidget>
        ) : (
          <MrConversation
            discussions={discussions.discussions}
            isLoading={discussions.isLoading}
            error={discussions.error}
            onRetry={discussions.reload}
            onPost={postNote == null ? null : (body: string) => postNote({ body })}
            onReply={discussions.reply}
            onResolve={discussions.resolve}
            resolveError={discussions.resolveError}
          />
        )}
      </StudioDetailLayout>
    );
  }

  return (
    <StudioDetailLayout
      header={
        <HeaderBand
          title="New merge request"
          meta={
            <span className="inline-flex items-center gap-1.5 font-mono text-2xs text-muted-foreground">
              <GitBranch size={11} aria-hidden />
              {branch ?? 'no branch'}
            </span>
          }
          actions={refreshButton}
        />
      }
      fit="bleed"
    >
      {sessionId != null && (
        <CreateMrForm sessionId={sessionId} branch={branch} error={error} onClose={onClose} />
      )}
    </StudioDetailLayout>
  );
};
