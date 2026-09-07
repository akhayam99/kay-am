import { invoke } from '@tauri-apps/api/core';
import type { OverrideSettings, ProviderId, WorkspaceId } from '@goodboy/types';
import type { GetFn, SetFn } from './types';

const EMPTY_OVERRIDE: OverrideSettings = {
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: null,
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter: null,
};

export const setWorkspaceProviderBinding = (set: SetFn, get: GetFn) => {
  return async (
    workspaceId: WorkspaceId,
    providerId: ProviderId,
    credentialId: string | null,
  ): Promise<void> => {
    const current = get().workspaceOverrides[workspaceId] ?? EMPTY_OVERRIDE;
    const bindings = { ...(current.providerBindings ?? {}) };
    if (credentialId === null) {
      delete bindings[providerId];
    } else {
      bindings[providerId] = credentialId;
    }
    const next: OverrideSettings = {
      ...current,
      providerBindings: Object.keys(bindings).length > 0 ? bindings : null,
    };
    await invoke('set_workspace_overrides', { workspaceId, overrides: next });
    set((state) => ({
      workspaceOverrides: { ...state.workspaceOverrides, [workspaceId]: next },
    }));
  };
};
