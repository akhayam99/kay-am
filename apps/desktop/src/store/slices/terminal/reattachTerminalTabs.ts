import type { SessionId, SessionProjectMount } from '@goodboy/types';
import { invokeTerminalListLive } from '../../../features/terminal/terminal';
import type { TerminalTab, TerminalTabId } from '../../../shared/types/terminal';
import type { SetFn } from './types';

type ParsedTerminalId = {
  readonly sessionId: SessionId;
  readonly ordinal: number;
};

type ParseParams = {
  readonly id: string;
};

const parseTerminalId = ({ id }: ParseParams): ParsedTerminalId | null => {
  const separatorIndex = id.lastIndexOf('::t');
  if (separatorIndex <= 0) {
    return null;
  }
  const ordinal = Number.parseInt(id.slice(separatorIndex + 3), 10);
  if (Number.isNaN(ordinal) || ordinal < 1) {
    return null;
  }
  return { sessionId: id.slice(0, separatorIndex) as SessionId, ordinal };
};

type OwnerParams = {
  readonly mounts: ReadonlyArray<SessionProjectMount>;
  readonly cwd: string | null;
};

const mountForCwd = ({ mounts, cwd }: OwnerParams): SessionProjectMount | null => {
  if (cwd == null || cwd === '') {
    return null;
  }
  return mounts.find((mount) => mount.worktreePath === cwd) ?? null;
};

export const reattachTerminalTabs = (set: SetFn) => {
  return async (): Promise<void> => {
    const liveTerminals = await invokeTerminalListLive();
    set((state) => {
      const terminalTabs = { ...state.terminalTabs };
      const activeTerminalTab = { ...state.activeTerminalTab };
      const rebuilt = new Map<SessionId, TerminalTab[]>();
      for (const live of liveTerminals) {
        const parsed = parseTerminalId({ id: live.id });
        if (parsed === null) {
          continue;
        }
        const mounts = state.sessionProjectMounts[parsed.sessionId] ?? [];
        const cwd = live.cwd;
        const owner = mountForCwd({ mounts, cwd });
        const tab: TerminalTab = {
          id: live.id as TerminalTabId,
          sessionId: parsed.sessionId,
          title: `Terminal ${parsed.ordinal}`,
          cwd,
          ...(owner === null ? {} : { projectId: owner.projectId }),
          ...(owner?.mountId === undefined ? {} : { mountId: owner.mountId }),
          status: 'running',
          createdAt: Date.now(),
        };
        const tabs = rebuilt.get(parsed.sessionId) ?? [];
        tabs.push(tab);
        rebuilt.set(parsed.sessionId, tabs);
      }
      for (const [sessionId, tabs] of rebuilt) {
        tabs.sort((left, right) =>
          left.title.localeCompare(right.title, undefined, { numeric: true }),
        );
        terminalTabs[sessionId] = tabs;
        activeTerminalTab[sessionId] = tabs[0]?.id ?? null;
      }
      return { terminalTabs, activeTerminalTab };
    });
  };
};
