import type { SessionId } from '@goodboy/types';
import { selectActiveMount, selectMountForPath } from '../project-mounts/selectors';
import type { TerminalTab, TerminalTabId } from '../../../shared/types/terminal';
import type { GetFn, SetFn } from './types';

function nextOrdinal(tabs: readonly TerminalTab[]): number {
  let max = 0;
  for (const tab of tabs) {
    const trailing = Number.parseInt(tab.id.slice(tab.id.lastIndexOf('t') + 1), 10);
    const ordinal = Number.isNaN(trailing) ? 1 : trailing;
    if (ordinal > max) {
      max = ordinal;
    }
  }
  return max + 1;
}

export const addTerminalTab = (set: SetFn, get: GetFn) => {
  return (sessionId: SessionId, cwd: string | null): TerminalTabId => {
    const tabs = get().terminalTabs[sessionId] ?? [];
    const n = nextOrdinal(tabs);
    const id = `${sessionId}::t${n}` as TerminalTabId;
    const state = get();
    const owner =
      selectMountForPath({ state, sessionId, path: cwd }) ??
      selectActiveMount({ state, sessionId });
    const tab: TerminalTab = {
      id,
      sessionId,
      title: `Terminal ${n}`,
      cwd,
      ...(owner?.projectId === undefined ? {} : { projectId: owner.projectId }),
      ...(owner?.mountId === undefined ? {} : { mountId: owner.mountId }),
      status: 'running',
      createdAt: Date.now(),
    };
    set((s) => ({
      terminalTabs: { ...s.terminalTabs, [sessionId]: [...tabs, tab] },
      activeTerminalTab: { ...s.activeTerminalTab, [sessionId]: id },
    }));
    return id;
  };
};
