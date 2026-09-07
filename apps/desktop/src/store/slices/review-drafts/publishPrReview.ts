import {
  addPullRequestReview,
  fetchPrNodeId,
  parseUnifiedDiff,
  type ReviewEvent,
} from '@goodboy/core';
import { formatError } from '@goodboy/ui';
import { markPrReviewDraftsPublished } from '@goodboy/db';
import type { GitlabIntegrationBinding, PrReviewDraft, SessionId, Workspace } from '@goodboy/types';
import { ghPrDiff, tauriGhRunner } from '../../../features/github/github';
import {
  gitlabCreateMrDiscussion,
  gitlabCreateMrNote,
  gitlabMrDiff,
  gitlabMrDiffRefs,
} from '../../../features/integrations/gitlab/client';
import { tauriDatabase } from '../../../shared/lib/db';
import { appendAttribution, isAttributionEnabled } from '../../../shared/utils/attribution';
import { computeStaleDrafts } from './computeStaleDrafts';
import { resolveReviewTarget, type ReviewTarget } from './resolveReviewTarget';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import type { SessionRepo } from '../worktrees/resolveSessionRepo';
import type {
  GetFn,
  PublishPrReviewOpts,
  PublishPrReviewResult,
  PublishPrReviewVerdict,
  SetFn,
} from './types';

const VERDICT_EVENT = {
  comment: 'COMMENT',
  approve: 'APPROVE',
  request_changes: 'REQUEST_CHANGES',
} as const satisfies Record<PublishPrReviewVerdict, ReviewEvent>;

const NOTE_PREFIX = {
  comment: '',
  approve: 'Approve: ',
  request_changes: 'Request changes: ',
} satisfies Record<PublishPrReviewVerdict, string>;

type GitlabHostParams = {
  readonly get: GetFn;
  readonly workspace: Workspace;
};

const gitlabHost = ({ get, workspace }: GitlabHostParams): string => {
  const integration = (get().workspaceIntegrations[workspace.id] ?? []).find(
    (candidate): candidate is GitlabIntegrationBinding => candidate.provider === 'gitlab',
  );
  if (integration == null) {
    throw new Error(`gitlab integration not connected for workspace ${workspace.id}`);
  }
  return integration.config.host;
};

type FetchDiffParams = {
  readonly get: GetFn;
  readonly workspace: Workspace;
  readonly repo: SessionRepo;
  readonly target: ReviewTarget;
};

const fetchCurrentDiff = async ({
  get,
  workspace,
  repo,
  target,
}: FetchDiffParams): Promise<string> => {
  if (target.provider === 'github') {
    return ghPrDiff(target.repo, target.prNumber, repo.repoRoot, workspace.id, repo.projectId);
  }
  return gitlabMrDiff(workspace.id, gitlabHost({ get, workspace }), target.repo, target.prNumber);
};

type ProviderPublishOutcome = {
  readonly publishedIds: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<{ readonly draft: PrReviewDraft; readonly error: string }>;
};

type PublishGithubParams = {
  readonly workspace: Workspace;
  readonly repo: SessionRepo;
  readonly target: ReviewTarget;
  readonly verdict: PublishPrReviewVerdict;
  readonly body: string;
  readonly fresh: ReadonlyArray<PrReviewDraft>;
};

const publishGithub = async ({
  workspace,
  repo,
  target,
  verdict,
  body,
  fresh,
}: PublishGithubParams): Promise<ProviderPublishOutcome> => {
  if (fresh.length === 0 && body.trim().length === 0 && verdict === 'comment') {
    return { publishedIds: [], failed: [] };
  }
  const ghOpts = {
    cwd: repo.repoRoot,
    workspaceId: workspace.id,
    projectId: repo.projectId,
  };
  try {
    const pullRequestId = await fetchPrNodeId(tauriGhRunner, target.repo, target.prNumber, ghOpts);
    await addPullRequestReview(
      tauriGhRunner,
      {
        pullRequestId,
        event: VERDICT_EVENT[verdict],
        body,
        threads: fresh.map((draft) => ({
          path: draft.path,
          line: draft.line,
          side: draft.side === 'old' ? ('LEFT' as const) : ('RIGHT' as const),
          startLine: draft.startLine,
          startSide: draft.startLine != null ? (draft.side === 'old' ? 'LEFT' : 'RIGHT') : null,
          body: draft.body,
        })),
      },
      ghOpts,
    );
    return { publishedIds: fresh.map((draft) => draft.id), failed: [] };
  } catch (err) {
    if (fresh.length === 0) {
      throw err;
    }
    const error = formatError(err);
    return { publishedIds: [], failed: fresh.map((draft) => ({ draft, error })) };
  }
};

type PublishGitlabParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly workspace: Workspace;
  readonly target: ReviewTarget;
  readonly verdict: PublishPrReviewVerdict;
  readonly body: string;
  readonly fresh: ReadonlyArray<PrReviewDraft>;
};

const publishGitlab = async ({
  get,
  sessionId,
  workspace,
  target,
  verdict,
  body,
  fresh,
}: PublishGitlabParams): Promise<ProviderPublishOutcome> => {
  const host = gitlabHost({ get, workspace });
  const publishedIds: string[] = [];
  const failed: { draft: PrReviewDraft; error: string }[] = [];
  const refs =
    fresh.length > 0
      ? await gitlabMrDiffRefs(workspace.id, host, target.repo, target.prNumber)
      : null;
  if (refs != null) {
    const shas = { baseSha: refs.baseSha, headSha: refs.headSha, startSha: refs.startSha };
    for (const draft of fresh) {
      const position =
        draft.side === 'old'
          ? { ...shas, newPath: draft.path, oldPath: draft.path, oldLine: draft.line }
          : { ...shas, newPath: draft.path, newLine: draft.line };
      try {
        await gitlabCreateMrDiscussion(
          workspace.id,
          host,
          target.repo,
          target.prNumber,
          draft.body,
          position,
        );
        publishedIds.push(draft.id);
      } catch (err) {
        failed.push({ draft, error: formatError(err) });
      }
    }
  }
  const trimmedBody = body.trim();
  if (trimmedBody.length > 0) {
    try {
      await gitlabCreateMrNote(
        workspace.id,
        host,
        target.repo,
        target.prNumber,
        `${NOTE_PREFIX[verdict]}${trimmedBody}`,
      );
    } catch (err) {
      void get().emitNotification(
        'error',
        'warning',
        'review summary note failed to post',
        formatError(err),
        { sessionId, workspaceId: workspace.id },
      );
    }
  }
  return { publishedIds, failed };
};

export const publishPrReview = (set: SetFn, get: GetFn) => {
  return async (
    sessionId: SessionId,
    opts: PublishPrReviewOpts,
  ): Promise<PublishPrReviewResult> => {
    const target = opts.target ?? resolveReviewTarget({ state: get(), sessionId });
    if (target == null) {
      throw new Error('no linked pull request or merge request for this session');
    }
    const session = get().sessions.find((candidate) => candidate.id === sessionId);
    const workspace = session
      ? get().workspaces.find((candidate) => candidate.id === session.workspaceId)
      : undefined;
    if (workspace == null) {
      throw new Error(`session not found: ${sessionId}`);
    }
    const repo = getSessionRepo({ get, sessionId });
    if (repo == null) {
      throw new Error(`session repository not found: ${sessionId}`);
    }
    const openDrafts = (get().reviewDrafts[sessionId] ?? []).filter(
      (draft) => draft.status === 'draft',
    );
    const drafts = openDrafts.filter(
      (draft) => draft.repo === target.repo && draft.prNumber === target.prNumber,
    );
    const mismatched = openDrafts.filter(
      (draft) => draft.repo !== target.repo || draft.prNumber !== target.prNumber,
    );

    const diff = await fetchCurrentDiff({ get, workspace, repo, target });
    const files = parseUnifiedDiff(diff);
    const { fresh, stale } = computeStaleDrafts({ drafts, files });

    const summaryBody =
      opts.body.trim().length === 0
        ? opts.body
        : appendAttribution({
            body: opts.body,
            isEnabled: isAttributionEnabled({ overrides: get().workspaceOverrides[workspace.id] }),
          });

    const outcome =
      target.provider === 'github'
        ? await publishGithub({
            workspace,
            repo,
            target,
            verdict: opts.verdict,
            body: summaryBody,
            fresh,
          })
        : await publishGitlab({
            get,
            sessionId,
            workspace,
            target,
            verdict: opts.verdict,
            body: summaryBody,
            fresh,
          });

    await markPrReviewDraftsPublished({ db: tauriDatabase, ids: [...outcome.publishedIds] });
    const publishedIds = new Set(outcome.publishedIds);
    const staleIds = new Set(stale.map((draft) => draft.id));
    set((state) => ({
      reviewDrafts: {
        ...state.reviewDrafts,
        [sessionId]: (state.reviewDrafts[sessionId] ?? []).map((draft) =>
          publishedIds.has(draft.id)
            ? { ...draft, status: 'published' as const, stale: false }
            : staleIds.has(draft.id)
              ? { ...draft, stale: true }
              : draft,
        ),
      },
    }));
    return {
      published: outcome.publishedIds.length,
      stale,
      failed: outcome.failed,
      mismatched,
    };
  };
};
