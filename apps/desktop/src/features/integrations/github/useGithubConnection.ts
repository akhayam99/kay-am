import { useCallback, useEffect, useState } from 'react';
import type { GhTokenStatus, WorkspaceId } from '@goodboy/types';
import { ghStatus } from '../../github/github';

const GITHUB_CONNECTION_CHANGED_EVENT = 'goodboy:github-connection-changed';

export const notifyGithubConnectionChanged = () => {
  window.dispatchEvent(new CustomEvent(GITHUB_CONNECTION_CHANGED_EVENT));
};

type Params = {
  readonly workspaceId: WorkspaceId | null;
};

type ConnectionState = {
  readonly status: GhTokenStatus | null;
  readonly isResolved: boolean;
};

export const useGithubConnection = ({ workspaceId }: Params) => {
  const [connection, setConnection] = useState<ConnectionState>({
    status: null,
    isResolved: false,
  });

  const read = useCallback(async () => {
    if (workspaceId == null) {
      setConnection({ status: null, isResolved: true });
      return;
    }
    try {
      const status = await ghStatus(workspaceId);
      setConnection({ status, isResolved: true });
    } catch {
      setConnection({ status: null, isResolved: true });
    }
  }, [workspaceId]);

  useEffect(() => {
    setConnection({ status: null, isResolved: false });
    void read();
  }, [read]);

  useEffect(() => {
    const onChanged = () => {
      void read();
    };
    window.addEventListener(GITHUB_CONNECTION_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(GITHUB_CONNECTION_CHANGED_EVENT, onChanged);
  }, [read]);

  const refresh = useCallback(() => {
    notifyGithubConnectionChanged();
  }, []);

  return {
    status: connection.status,
    user: connection.status?.user ?? null,
    mode: connection.status?.mode ?? 'absent',
    isAuthenticated: connection.status?.mode !== 'absent' && connection.status != null,
    isResolved: connection.isResolved,
    isScoped: connection.status?.scoped === true,
    refresh,
  };
};
