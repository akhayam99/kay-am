// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionId } from '@goodboy/types';
import { ROLE_DEFAULTS } from '@goodboy/core';
import type { CommentAgentArgs } from '../../../chat/spawn-from-comment';

type Overrides = { readonly roleModels: Record<string, unknown> | null };

const { state } = vi.hoisted(() => ({
  state: {
    sessions: [{ id: 'session-1', workspaceId: 'workspace-1' }],
    workspaceOverrides: {} as Record<string, { roleModels: Record<string, unknown> | null }>,
    spawnAgent: vi.fn(async () => 'agent-1'),
    setAgentConfig: vi.fn(async () => undefined),
  },
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T>(selector: (store: typeof state) => T) => selector(state),
}));

import { useResolverSpawner } from './index';

const SESSION_ID = 'session-1' as SessionId;

const ARGS: CommentAgentArgs = {
  name: 'resolve: alice on foo.ts:42',
  kind: 'resolver',
  initialPrompt: 'resolve the thread',
  sourceCommentUrl: 'https://github.com/o/r/pull/1#discussion_r1',
  sourceKind: 'review_comment',
};

const withOverrides = (overrides: Overrides | null) => {
  state.workspaceOverrides = overrides == null ? {} : { 'workspace-1': overrides };
};

beforeEach(() => {
  withOverrides(null);
  state.spawnAgent.mockReset();
  state.spawnAgent.mockResolvedValue('agent-1');
  state.setAgentConfig.mockReset();
  state.setAgentConfig.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('useResolverSpawner', () => {
  it('routes an empty choice through the resolver role default', async () => {
    withOverrides({
      roleModels: {
        resolver: { providerId: 'codex', model: 'gpt-5.6', effort: 'high' },
      },
    });
    const { result } = renderHook(() => useResolverSpawner({ sessionId: SESSION_ID }));

    await act(async () => {
      await result.current.spawnResolver({ args: ARGS, choice: {} });
    });

    expect(state.spawnAgent).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ provider: 'codex', model: 'gpt-5.6', effort: 'high' }),
    );
    expect(state.setAgentConfig).toHaveBeenCalledWith(SESSION_ID, 'agent-1', {
      providerOverride: 'codex',
      modelOverride: 'gpt-5.6',
      effort: 'high',
    });
  });

  it('lets an explicit popover choice win over the role default', async () => {
    withOverrides({
      roleModels: {
        resolver: { providerId: 'codex', model: 'gpt-5.6', effort: 'high' },
      },
    });
    const { result } = renderHook(() => useResolverSpawner({ sessionId: SESSION_ID }));

    await act(async () => {
      await result.current.spawnResolver({
        args: ARGS,
        choice: { provider: 'anthropic', model: 'claude-opus-5', effort: 'medium' },
      });
    });

    expect(state.spawnAgent).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-opus-5',
        effort: 'medium',
      }),
    );
    expect(state.setAgentConfig).toHaveBeenCalledWith(SESSION_ID, 'agent-1', {
      providerOverride: 'anthropic',
      modelOverride: 'claude-opus-5',
      effort: 'medium',
    });
  });

  it('ignores a preference stored for another role', async () => {
    withOverrides({
      roleModels: {
        custom: { providerId: 'codex', model: 'gpt-5.6', effort: 'high' },
      },
    });
    const { result } = renderHook(() => useResolverSpawner({ sessionId: SESSION_ID }));

    await act(async () => {
      await result.current.spawnResolver({ args: ARGS, choice: {} });
    });

    expect(state.spawnAgent).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        provider: ROLE_DEFAULTS.resolver.provider,
        model: ROLE_DEFAULTS.resolver.model,
        effort: ROLE_DEFAULTS.resolver.effort,
      }),
    );
  });

  it('tracks every resolver it spawned', async () => {
    const { result } = renderHook(() => useResolverSpawner({ sessionId: SESSION_ID }));

    await act(async () => {
      await result.current.spawnResolver({ args: ARGS, choice: {} });
    });

    expect(state.spawnAgent).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ kindOverride: 'resolver' }),
    );
    expect(result.current.spawnedResolverIds).toEqual(['agent-1']);
  });
});
