import { detectRepoSlug } from '@goodboy/core';
import { upsertMountPullRequestLink } from '@goodboy/db';
import type { IsoDateTime, MountId, MountPullRequestLink, SessionId } from '@goodboy/types';
import { tauriGhRunner } from '../../../features/github/github';
import { appendClosingReferences } from '../../../features/github/appendClosingReferences';
import { closingIssueReferences } from '../../../features/github/closingIssueReferences';
import { tauriDatabase } from '../../../shared/lib/db';
import { mountRequestEventPayload } from '../project-mounts/mountRequests';
import { githubRequestHost } from './mountPrLink';
import { resolveSessionPrFetch } from './resolveSessionPrFetch';
import type { GetFn, SetFn } from './types';

export type CreatePrReferenceMode = 'closing' | 'none';

export type CreatePrInput = {
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
  readonly title?: string;
  readonly body?: string;
  readonly base?: string;
  readonly draft?: boolean;
  readonly referenceMode?: CreatePrReferenceMode;
};

const PR_URL = /\/pull\/(\d+)(?:$|[?#/])/;

type ParseParams = {
  readonly stdout: string;
};

const parseCreatedPrUrl = ({ stdout }: ParseParams): string | null => {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('http'));
  for (const line of lines.reverse()) {
    if (PR_URL.test(line)) {
      return line;
    }
  }
  return null;
};

export const createPrForSession = (_set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    mountId,
    title,
    body,
    base,
    draft,
    referenceMode,
  }: CreatePrInput): Promise<void> => {
    const target = resolveSessionPrFetch({
      state: get(),
      sessionId,
      ...(mountId === undefined ? {} : { mountId }),
    });
    if (target === null) {
      throw new Error(
        'No mount is linked to this session yet, open it once so its worktree resolves.',
      );
    }
    const { session, mount, cwd } = target;
    const workspace = get().workspaces.find((candidate) => candidate.id === session.workspaceId);
    if (workspace === undefined) {
      throw new Error('Workspace not found for this session.');
    }
    if (mount.branch.length === 0) {
      throw new Error(
        'No branch is linked to this mount yet, open it once so its worktree resolves.',
      );
    }
    const ghOptions = {
      cwd,
      workspaceId: session.workspaceId,
      projectId: mount.projectId,
    };
    const repository =
      mount.repoSlug ??
      (await detectRepoSlug(tauriGhRunner, cwd, session.workspaceId, mount.projectId));
    if (repository === null || repository === '') {
      throw new Error('No GitHub repository is linked to this mount.');
    }
    const linkedTasks = get().sessionExternalTasks[sessionId] ?? [];
    const references = referenceMode === 'none' ? [] : linkedTasks;
    const projectBaseBranch = get().projects.find(
      (project) => project.id === mount.projectId,
    )?.baseBranch;
    const baseBranch = base?.trim() || mount.baseBranch || projectBaseBranch;
    const args = ['pr', 'create', '--repo', repository, '--head', mount.branch];
    const hasFields = title !== undefined || body !== undefined;
    if (hasFields) {
      const filledBody = body ?? '';
      args.push('--title', title?.trim() || session.goal);
      args.push(
        '--body',
        appendClosingReferences({
          body: filledBody,
          references: closingIssueReferences({
            tasks: references,
            branch: mount.branch,
            body: filledBody,
          }),
        }),
      );
    } else {
      args.push('--fill');
    }
    if (baseBranch != null && baseBranch !== '') {
      args.push('--base', baseBranch);
    }
    const isDraft = draft ?? true;
    if (isDraft) {
      args.push('--draft');
    }

    const res = await tauriGhRunner.run(args, ghOptions);
    if (res.exitCode !== 0) {
      const errMsg = res.stderr.trim() || `gh pr create exited with ${res.exitCode}`;
      void get().emitNotification('error', 'error', 'PR creation failed', errMsg, {
        sessionId,
        workspaceId: workspace.id,
      });
      throw new Error(errMsg);
    }
    const url = parseCreatedPrUrl({ stdout: res.stdout });
    const number = url === null ? null : Number(PR_URL.exec(url)?.[1] ?? Number.NaN);
    if (url !== null && number !== null && Number.isInteger(number)) {
      const now = new Date().toISOString() as IsoDateTime;
      const link: MountPullRequestLink = {
        id: crypto.randomUUID(),
        mountId: mount.id,
        provider: 'github',
        host: githubRequestHost({ url }),
        repoSlug: repository,
        prNumber: number,
        headBranch: mount.branch,
        baseBranch: baseBranch ?? null,
        url,
        state: isDraft ? 'draft' : 'open',
        snapshot: null,
        lastObservedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await upsertMountPullRequestLink({ db: tauriDatabase, sessionId, link });
      await get().recordSessionEventOnce({
        sessionId,
        kind: 'pr_created',
        payload: mountRequestEventPayload({
          mountId: mount.id,
          projectId: mount.projectId,
          identity: link,
          title: title?.trim() || session.goal,
          url,
          branch: mount.branch,
        }),
      });
    }
    await get().refreshSessionPr(sessionId, { force: true, mountId: mount.id });
    const created = get().mountGithub?.[mount.id]?.pr ?? null;
    if (!hasFields && created !== null && referenceMode !== 'none') {
      const filledReferences = closingIssueReferences({
        tasks: linkedTasks,
        branch: mount.branch,
        body: created.body,
      });
      if (filledReferences.length > 0) {
        await get()
          .editPr(sessionId, created.number, {
            body: appendClosingReferences({ body: created.body, references: filledReferences }),
          })
          .catch(() => undefined);
      }
    }
    void get().emitNotification(
      'pr-created',
      'success',
      `PR created for: ${session.goal}`,
      undefined,
      { sessionId, workspaceId: workspace.id },
    );
  };
};
