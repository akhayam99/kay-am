import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { formatError } from '@goodboy/ui';
import type { MountId, ProjectId, SessionId } from '@goodboy/types';
import {
  deferredMaterializeMessage,
  materializationGate,
  priorMountCount,
  proposeMaterialization,
  runMaterializationBatch,
} from '../../store/materializationGate';
import { useAppStore } from '../../store/store';
import { isMainWindow } from '../workspace/window';

const MATERIALIZE_EVENT = 'query-bridge://project-materialize';

type MaterializeRequest = {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly reason: string;
};

type MaterializeOutcome = {
  readonly ok: boolean;
  readonly error?: string;
  readonly mountId?: MountId;
  readonly mountPath?: string;
  readonly branch?: string;
};

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const executeMaterializeRequest = async (
  request: MaterializeRequest,
): Promise<MaterializeOutcome> => {
  const get = useAppStore.getState;
  const project = get().projects.find((candidate) => candidate.id === request.projectId) ?? null;
  if (project === null) {
    return { ok: false, error: `unknown project: ${request.projectName}` };
  }
  return runMaterializationBatch({
    sessionId: request.sessionId,
    run: async () => {
      const decision = materializationGate({
        get,
        sessionId: request.sessionId,
        project,
        priorMounts: priorMountCount({ get, sessionId: request.sessionId }),
        immediateCount: 0,
      });
      if (decision.kind === 'deferred') {
        await proposeMaterialization({
          get,
          sessionId: request.sessionId,
          project,
          reason: request.reason,
          cause: decision.cause,
          agentId: null,
          turnRunId: null,
        });
        return {
          ok: false,
          error: deferredMaterializeMessage({
            projectName: project.name,
            cause: decision.cause,
          }),
        };
      }
      try {
        const mount = await get().materializeProject({
          sessionId: request.sessionId,
          projectId: request.projectId,
          reason: request.reason,
        });
        return {
          ok: true,
          ...(mount.mountId === undefined ? {} : { mountId: mount.mountId }),
          mountPath: mount.worktreePath,
          branch: mount.branch,
        };
      } catch (error) {
        return { ok: false, error: formatError(error) };
      }
    },
  });
};

export const listenProjectMaterializeRequests = async (): Promise<UnlistenFn> => {
  if (!inTauri() || !isMainWindow()) {
    return () => undefined;
  }
  return listen<MaterializeRequest>(MATERIALIZE_EVENT, (event) => {
    const request = event.payload;
    void executeMaterializeRequest(request)
      .then((result) =>
        invoke('project_materialize_result', {
          id: request.id,
          ok: result.ok,
          error: result.error ?? null,
          mountId: result.mountId ?? null,
          mountPath: result.mountPath ?? null,
          branch: result.branch ?? null,
        }),
      )
      .catch((error) => console.error('[query-bridge] materialize result dispatch failed', error));
  });
};
