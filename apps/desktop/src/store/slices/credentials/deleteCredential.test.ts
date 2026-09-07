import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CredentialId,
  IsoDateTime,
  OverrideSettings,
  ProviderCredential,
  ProviderId,
  WorkspaceId,
} from '@goodboy/types';
import type { AppStore } from '../../store';
import { deleteCredential } from './deleteCredential';

const invokeSpy = vi.fn(async () => null);
const deleteProviderCredentialSpy = vi.fn(async () => undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: ReadonlyArray<unknown>) => invokeSpy(...(args as [])),
}));

vi.mock('@goodboy/db', () => ({
  deleteProviderCredential: (...args: ReadonlyArray<unknown>) =>
    deleteProviderCredentialSpy(...(args as [])),
}));

vi.mock('../../../shared/lib/db', () => ({
  tauriDatabase: {},
}));

const credentialId = 'cred-1' as CredentialId;

const credential: ProviderCredential = {
  id: credentialId,
  providerId: 'anthropic' as ProviderId,
  label: 'personal',
  hint: 'sk-...abcd',
  createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
};

type StoreShape = Pick<AppStore, 'providerCredentials' | 'workspaceOverrides'>;

const boundOverride: OverrideSettings = {
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: { anthropic: credentialId },
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter: null,
};

const makeHarness = ({ boundBy }: { readonly boundBy: ReadonlyArray<WorkspaceId> }) => {
  let state: StoreShape = {
    providerCredentials: [credential],
    workspaceOverrides: Object.fromEntries(
      boundBy.map((workspaceId) => [workspaceId, boundOverride]),
    ),
  };
  const set = vi.fn((partial: unknown) => {
    const next =
      typeof partial === 'function' ? (partial as (s: StoreShape) => object)(state) : partial;
    state = { ...state, ...(next as object) } as StoreShape;
  });
  const get = () => state as AppStore;
  return {
    run: deleteCredential(set as never, get as never),
    read: () => state,
  };
};

describe('deleteCredential', () => {
  beforeEach(() => {
    invokeSpy.mockClear();
    deleteProviderCredentialSpy.mockClear();
  });

  it('refuses while a workspace still binds the key, and keeps the secret', async () => {
    const h = makeHarness({ boundBy: ['ws-1' as WorkspaceId, 'ws-2' as WorkspaceId] });

    await expect(h.run(credentialId)).rejects.toThrow(/2 workspaces still use this key/);

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(deleteProviderCredentialSpy).not.toHaveBeenCalled();
    expect(h.read().providerCredentials).toHaveLength(1);
  });

  it('removes the key once no workspace binds it', async () => {
    const h = makeHarness({ boundBy: [] });

    await h.run(credentialId);

    expect(invokeSpy).toHaveBeenCalledWith('secret_delete', expect.anything());
    expect(deleteProviderCredentialSpy).toHaveBeenCalledWith({}, credentialId);
    expect(h.read().providerCredentials).toHaveLength(0);
  });
});
