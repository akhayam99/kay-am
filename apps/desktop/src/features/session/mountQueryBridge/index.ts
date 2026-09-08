import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { listMountPullRequestLinks } from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type {
  MountId,
  MountPullRequestLink,
  ProjectId,
  SessionId,
  SessionMountView,
} from '@goodboy/types';
import {
  worktreeDirectorySize,
  worktreeStatus,
  worktreeWriterStatus,
} from '../../worktree/worktree';
import { mountCleanupBlockers } from '../../../store/slices/mount-cleanup/cleanupPolicy';
import {
  mountContinuationRefusal,
  queueMountContinuation,
} from '../../../store/slices/turn/mountContinuations';
import { tauriDatabase } from '../../../shared/lib/db';
import { useAppStore } from '../../../store/store';
import { isMainWindow } from '../../workspace/window';
import { executeSeriesRequest, type SeriesBridgeRequest } from './series';

const MOUNT_EVENT = 'query-bridge://mount-command';

type BridgeArgs = Readonly<Record<string, unknown>>;

export type MountBridgeRequest = {
  readonly id: string;
  readonly provider: 'mount' | 'github' | 'gitlab';
  readonly verb: string;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly projectId: ProjectId | null;
  readonly requestId?: string;
  readonly reason?: string;
  readonly args: BridgeArgs;
};

export type BridgeRequest = MountBridgeRequest | SeriesBridgeRequest;

export type MountBridgeOutcome = {
  readonly ok: boolean;
  readonly error?: string;
  readonly code?: string;
  readonly data?: unknown;
};

const BRIDGE_CODE: Readonly<Record<string, string>> = {
  'branch-mismatch': 'branch_mismatch',
  'branch-taken': 'branch_in_use',
  'branch-missing': 'mount_unavailable',
  'directory-busy': 'unsafe_cleanup',
  'directory-occupied': 'unsafe_cleanup',
  'mount-missing': 'mount_unavailable',
  'project-missing': 'mount_unavailable',
  'repository-unavailable': 'mount_unavailable',
  'revision-conflict': 'request_conflict',
};

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const text = ({ args, key }: { readonly args: BridgeArgs; readonly key: string }): string => {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
};

const truthy = ({ args, key }: { readonly args: BridgeArgs; readonly key: string }): boolean =>
  args[key] === true;

export const mountResult = (view: SessionMountView): Record<string, unknown> => ({
  mountId: view.id,
  sessionId: view.sessionId,
  projectId: view.projectId,
  mountName: view.mountName,
  branch: view.branch,
  baseBranch: view.baseBranch,
  mountPath: view.worktreePath,
  isAttached: view.isAttached,
  diskState: view.diskState,
  revision: view.revision,
});

type ContinuationParams = {
  readonly request: MountBridgeRequest;
  readonly mount: SessionMountView;
  readonly origin: 'fork' | 'attach';
};

type Continuation = {
  readonly operationId: string;
  readonly requiresNewTurn: boolean;
  readonly note?: string;
};

const boundMountId = ({ sessionId }: { readonly sessionId: SessionId }): MountId | null => {
  const state = useAppStore.getState();
  const selected = state.sessionActiveMount?.[sessionId] ?? null;
  if (selected !== null) {
    return selected;
  }
  const session = state.sessions?.find((candidate) => candidate.id === sessionId);
  return session?.activeMountId ?? null;
};

const requestContinuation = ({ request, mount, origin }: ContinuationParams): Continuation => {
  const operationId = request.requestId ?? `${origin}:${mount.id}:${mount.revision}`;
  const outcome = queueMountContinuation({
    continuation: {
      operationId,
      sessionId: request.sessionId,
      mountId: mount.id,
      mountName: mount.mountName,
      branch: mount.branch,
      worktreePath: mount.worktreePath ?? '',
      origin,
    },
    boundMountId: boundMountId({ sessionId: request.sessionId }),
  });
  if (outcome.queued) {
    return { operationId, requiresNewTurn: true };
  }
  return {
    operationId,
    requiresNewTurn: false,
    note: mountContinuationRefusal({ refusal: outcome.refusal }),
  };
};

const bridgeErrorCode = (error: unknown): string | undefined => {
  const code = (error as { readonly code?: unknown } | null)?.code;
  return typeof code === 'string' ? BRIDGE_CODE[code] : undefined;
};

type InspectParams = {
  readonly request: MountBridgeRequest;
};

const inspect = async ({ request }: InspectParams): Promise<MountBridgeOutcome> => {
  const get = useAppStore.getState;
  const { mount, inspection } = await get().inspectMount({
    sessionId: request.sessionId,
    mountId: request.mountId,
  });
  const path = mount.worktreePath;
  const status =
    path === null ? null : await worktreeStatus({ worktreePath: path }).catch(() => null);
  const lease = path === null ? null : await worktreeWriterStatus({ path });
  const blockers =
    path === null
      ? ['this mount has no directory']
      : [
          ...mountCleanupBlockers({
            state: get(),
            sessionId: request.sessionId,
            mountId: request.mountId,
            worktreePath: path,
          }),
          ...(lease !== null && lease.isGranted && !lease.hasExited
            ? ['a writer lease still holds the worktree']
            : []),
          ...(status !== null && status.inProgress !== null
            ? [`a ${status.inProgress} is in progress`]
            : []),
        ];
  const size =
    path === null || !truthy({ args: request.args, key: 'size' })
      ? null
      : await worktreeDirectorySize({ path });
  return {
    ok: true,
    data: {
      mount: mountResult(mount),
      head: {
        inspection: inspection.kind,
        branch: status?.branch ?? null,
        commit: status?.head ?? null,
        matchesMount: status?.branch === mount.branch,
      },
      safety: { canRemove: blockers.length === 0, blockers },
      size: size === null ? null : { bytes: size.sizeBytes, isPartial: size.isPartial },
    },
  };
};

const loadedMount = async (request: MountBridgeRequest): Promise<SessionMountView | undefined> => {
  const views = await useAppStore.getState().loadSessionMounts({ sessionId: request.sessionId });
  return views.find((candidate) => candidate.id === request.mountId);
};

const satisfiesBranch = ({
  requested,
  branch,
}: {
  readonly requested: string;
  readonly branch: string;
}): boolean => requested === '' || branch === requested || branch.endsWith(`/${requested}`);

const forkFrom = async ({ request }: InspectParams): Promise<MountBridgeOutcome> => {
  const get = useAppStore.getState;
  const source = await loadedMount(request);
  if (source === undefined) {
    return { ok: false, error: 'the source mount is not loaded', code: 'mount_unavailable' };
  }
  const base = text({ args: request.args, key: 'base' });
  const requested = text({ args: request.args, key: 'branch' });
  const mount = await get().forkMount({
    sessionId: request.sessionId,
    projectId: source.projectId,
    branch: requested,
    adoptExistingBranch: truthy({ args: request.args, key: 'existing' }),
    ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
    ...(base === '' ? {} : { baseBranch: base }),
  });
  if (mount.id === source.id) {
    return {
      ok: false,
      error: `the fork returned the mount it forked from (${source.id}) instead of a new one`,
      code: 'fork_unsatisfied',
    };
  }
  if (!satisfiesBranch({ requested, branch: mount.branch })) {
    return {
      ok: false,
      error: `the fork asked for ${requested} but the new mount sits on ${mount.branch}`,
      code: 'fork_unsatisfied',
    };
  }
  const continuation = requestContinuation({ request, mount, origin: 'fork' });
  return {
    ok: true,
    data: {
      operationId: continuation.operationId,
      sourceMountId: request.mountId,
      mount: mountResult(mount),
      requiresNewTurn: continuation.requiresNewTurn,
      ...(continuation.note === undefined ? {} : { note: continuation.note }),
    },
  };
};

const switchTo = async ({ request }: InspectParams): Promise<MountBridgeOutcome> => {
  const get = useAppStore.getState;
  const createNew = truthy({ args: request.args, key: 'create' });
  const adoptObserved = truthy({ args: request.args, key: 'adoptObserved' });
  if (createNew && adoptObserved) {
    return {
      ok: false,
      error: '--create cuts a new branch from HEAD and cannot also adopt an observed one',
      code: 'branch_mismatch',
    };
  }
  const previous = await loadedMount(request);
  if (adoptObserved) {
    await get().resolveMountBranchMismatch({
      sessionId: request.sessionId,
      mountId: request.mountId,
      resolution: 'adopt-observed',
    });
  }
  const mount = await get().switchMount({
    sessionId: request.sessionId,
    mountId: request.mountId,
    branch: text({ args: request.args, key: 'branch' }),
    createNew,
    ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
  });
  return {
    ok: true,
    data: {
      operationId: request.requestId ?? null,
      previousBranch: previous?.branch ?? null,
      mount: mountResult(mount),
    },
  };
};

const attach = async ({ request }: InspectParams): Promise<MountBridgeOutcome> => {
  const mount = await useAppStore.getState().attachMount({
    sessionId: request.sessionId,
    mountId: request.mountId,
    ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
  });
  const continuation = requestContinuation({ request, mount, origin: 'attach' });
  return {
    ok: true,
    data: {
      operationId: continuation.operationId,
      mount: mountResult(mount),
      requiresNewTurn: continuation.requiresNewTurn,
      ...(continuation.note === undefined ? {} : { note: continuation.note }),
    },
  };
};

const unmount = async ({ request }: InspectParams): Promise<MountBridgeOutcome> => {
  const outcome = await useAppStore.getState().unmountMount({
    sessionId: request.sessionId,
    mountId: request.mountId,
    keepDirectory: truthy({ args: request.args, key: 'keep' }),
    ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
  });
  const disposition = outcome.kept
    ? 'kept'
    : outcome.mount.diskState === 'missing'
      ? 'missing'
      : 'removed';
  return {
    ok: true,
    data: {
      operationId: request.requestId ?? null,
      mount: mountResult(outcome.mount),
      disposition,
      reason: outcome.reason,
    },
  };
};

const activate = async ({ request }: InspectParams): Promise<MountBridgeOutcome> => {
  await useAppStore.getState().setSessionActiveMount({
    sessionId: request.sessionId,
    mountId: request.mountId,
  });
  return { ok: true, data: { mountId: request.mountId, appliesTo: 'next-turn' } };
};

const resolveMismatch = async ({ request }: InspectParams): Promise<MountBridgeOutcome> => {
  const get = useAppStore.getState;
  const intent = text({ args: request.args, key: 'intent' });
  await get().resolveMountBranchMismatch({
    sessionId: request.sessionId,
    mountId: request.mountId,
    resolution: intent === 'fork' ? 'keep-both' : 'adopt-observed',
  });
  const views = await get().loadSessionMounts({ sessionId: request.sessionId });
  return {
    ok: true,
    data: {
      operationId: request.requestId ?? null,
      mounts: views.map(mountResult),
    },
  };
};

type LinkParams = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly branch: string;
};

const linkForBranch = async ({
  sessionId,
  mountId,
  branch,
}: LinkParams): Promise<MountPullRequestLink | null> => {
  const links = await listMountPullRequestLinks({ db: tauriDatabase, sessionId, mountId });
  const open = links.filter(
    (link) => link.headBranch === branch && link.state !== 'closed' && link.state !== 'merged',
  );
  return open[open.length - 1] ?? null;
};

const linkResult = ({
  link,
  created,
}: {
  readonly link: MountPullRequestLink;
  readonly created: boolean;
}): Record<string, unknown> => ({
  mountId: link.mountId,
  provider: link.provider,
  host: link.host,
  repo: link.repoSlug,
  number: link.prNumber,
  url: link.url,
  state: link.state,
  created,
});

const requestReferenceMode = ({
  args,
}: {
  readonly args: BridgeArgs;
}): 'closing' | 'part-of' | 'none' => {
  const raw = text({ args, key: 'referenceMode' });
  if (raw === 'closes') {
    return 'closing';
  }
  return raw === 'none' ? 'none' : 'part-of';
};

const createRequest = async ({ request }: InspectParams): Promise<MountBridgeOutcome> => {
  const get = useAppStore.getState;
  const mount = await loadedMount(request);
  if (mount === undefined) {
    return { ok: false, error: 'that mount is not loaded', code: 'mount_unavailable' };
  }
  if (request.provider === 'gitlab') {
    await get()
      .refreshSessionMr(request.sessionId, { force: true, mountId: request.mountId })
      .catch(() => undefined);
  } else {
    await get()
      .refreshSessionPr(request.sessionId, { force: true, mountId: request.mountId })
      .catch(() => undefined);
  }
  const existing = await linkForBranch({
    sessionId: request.sessionId,
    mountId: request.mountId,
    branch: mount.branch,
  });
  if (existing !== null) {
    return { ok: true, data: linkResult({ link: existing, created: false }) };
  }
  const base = text({ args: request.args, key: 'base' });
  const draft = !truthy({ args: request.args, key: 'ready' });
  const title = text({ args: request.args, key: 'title' });
  const body = text({ args: request.args, key: 'body' });
  const referenceMode = requestReferenceMode({ args: request.args });
  if (request.provider === 'gitlab') {
    await get().createMrForSession({
      sessionId: request.sessionId,
      mountId: request.mountId,
      title,
      description: body,
      draft,
      referenceMode,
      ...(base === '' ? {} : { targetBranch: base }),
    });
  } else {
    await get().createPrForSession({
      sessionId: request.sessionId,
      mountId: request.mountId,
      title,
      body,
      draft,
      referenceMode,
      ...(base === '' ? {} : { base }),
    });
  }
  const link = await linkForBranch({
    sessionId: request.sessionId,
    mountId: request.mountId,
    branch: mount.branch,
  });
  if (link === null) {
    return {
      ok: false,
      error: 'the request was created but Goodboy could not read it back',
      code: 'operation_pending',
    };
  }
  return { ok: true, data: linkResult({ link, created: true }) };
};

export const executeMountRequest = async (request: BridgeRequest): Promise<MountBridgeOutcome> => {
  try {
    if (request.provider === 'series') {
      return await executeSeriesRequest({ request });
    }
    if (request.verb === 'create-request') {
      return await createRequest({ request });
    }
    switch (request.verb) {
      case 'inspect':
        return await inspect({ request });
      case 'fork':
        return await forkFrom({ request });
      case 'switch':
        return await switchTo({ request });
      case 'attach':
        return await attach({ request });
      case 'unmount':
        return await unmount({ request });
      case 'activate':
        return await activate({ request });
      case 'resolve':
        return await resolveMismatch({ request });
      default:
        return { ok: false, error: `unhandled mount command: ${request.verb}` };
    }
  } catch (error) {
    const code = bridgeErrorCode(error);
    return { ok: false, error: formatError(error), ...(code === undefined ? {} : { code }) };
  }
};

export const listenMountCommands = async (): Promise<UnlistenFn> => {
  if (!inTauri() || !isMainWindow()) {
    return () => undefined;
  }
  return listen<BridgeRequest>(MOUNT_EVENT, (event) => {
    const request = event.payload;
    void executeMountRequest(request)
      .then((result) =>
        invoke('mount_command_result', {
          id: request.id,
          ok: result.ok,
          error: result.error ?? null,
          code: result.code ?? null,
          data: result.data ?? null,
        }),
      )
      .catch((error) => console.error('[query-bridge] mount result dispatch failed', error));
  });
};
