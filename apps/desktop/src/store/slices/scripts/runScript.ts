import type { MountId, ProjectScriptId, SessionId } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import {
  invokeScriptRun,
  type ScriptRunRecord,
  type ScriptRunResult,
} from '../../../features/scripts/scripts';
import {
  selectProjectMounts,
  selectUnambiguousProjectMount,
  selectWritableMountPath,
} from '../project-mounts/selectors';
import { registerScriptRunListeners } from './registerScriptRunListeners';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly sessionId: SessionId;
  readonly scriptId: ProjectScriptId;
  readonly mountId?: MountId;
  readonly cols?: number;
  readonly rows?: number;
};

type WriteRunParams = {
  readonly record: ScriptRunRecord;
};

export const runScript = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, scriptId, mountId, cols = 220, rows = 50 }: Params) => {
    const runId = crypto.randomUUID();
    const startedAt = Date.now();

    const writeRun = ({ record }: WriteRunParams) =>
      set((state) => ({
        scriptRuns: {
          ...state.scriptRuns,
          [sessionId]: { ...state.scriptRuns[sessionId], [scriptId]: record },
        },
      }));

    writeRun({ record: { status: 'pending', result: null, runId, startedAt } });

    const state = get();
    const session = state.sessions.find((candidate) => candidate.id === sessionId);
    const script =
      session === undefined
        ? undefined
        : (state.projectScripts[session.workspaceId] ?? []).find(
            (candidate) => candidate.id === scriptId,
          );
    const resolveCwd = (): string | null => {
      if (script === undefined) {
        return null;
      }
      if (mountId !== undefined) {
        return selectWritableMountPath({ state, sessionId, mountId });
      }
      return (
        selectUnambiguousProjectMount({ state, sessionId, projectId: script.projectId })
          ?.worktreePath ?? null
      );
    };
    const cwd = resolveCwd();
    if (script === undefined || cwd === null) {
      const project =
        script === undefined
          ? undefined
          : state.projects.find((candidate) => candidate.id === script.projectId);
      const candidateCount =
        script === undefined
          ? 0
          : selectProjectMounts({ state, sessionId, projectId: script.projectId }).length;
      const projectLabel = project?.name ?? 'Script project';
      const unmountedMessage =
        candidateCount > 1
          ? `${projectLabel} has several mounts in this session. Pick the mount to run in.`
          : `${projectLabel} is not mounted in this session`;
      const message =
        script === undefined ? 'Script is not available in this session' : unmountedMessage;
      const result: ScriptRunResult = { stdout: '', stderr: message, exitCode: -1 };
      writeRun({ record: { status: 'error', result, runId, startedAt } });
      return result;
    }

    const registered = await registerScriptRunListeners({
      set,
      get,
      sessionId,
      scriptId,
      runId,
      startedAt,
      name: script.name,
    });

    try {
      await invokeScriptRun({ scriptId, runId, sessionId, cwd, cols, rows });
    } catch (caughtError) {
      registered.dispose();
      const result: ScriptRunResult = {
        stdout: '',
        stderr: formatError(caughtError),
        exitCode: -1,
      };
      writeRun({ record: { status: 'error', result, runId, startedAt } });
      return result;
    }

    return registered.result;
  };
};
