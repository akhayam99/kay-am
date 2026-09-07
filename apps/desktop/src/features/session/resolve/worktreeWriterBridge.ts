import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../../../store/store';
import { isMainWindow } from '../../workspace/window';

const WRITER_EVENT = 'worktree_writer_event';
const RECONCILE_INTERVAL_MS = 60_000;

type WriterLeaseEvent = {
  readonly path: string;
  readonly holder: string;
  readonly reason: string;
};

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const startWorktreeWriterBridge = async (): Promise<UnlistenFn> => {
  if (!inTauri() || !isMainWindow()) {
    return () => undefined;
  }
  const unlisten = await listen<WriterLeaseEvent>(WRITER_EVENT, (event) => {
    void useAppStore.getState().drainResolveWorktree({ worktreePath: event.payload.path });
  });
  void useAppStore.getState().reconcileResolveDrains();
  const timer = setInterval(() => {
    void useAppStore.getState().reconcileResolveDrains();
  }, RECONCILE_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    unlisten();
  };
};
