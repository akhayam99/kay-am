import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resolveRoleRouting, resolveStoredModelSelection } from '@goodboy/core';
import type { ProviderId, RoleModelPreference } from '@goodboy/types';
import { RoleModelRow } from './index';

const CONNECTED = ['anthropic', 'cursor'] satisfies ReadonlyArray<ProviderId>;
const ANTHROPIC_ONLY = ['anthropic'] satisfies ReadonlyArray<ProviderId>;

type RenderParams = {
  readonly preference: RoleModelPreference | null;
  readonly onChange: (preference: RoleModelPreference | null) => void;
};

type RowParams = {
  readonly preference: RoleModelPreference | null;
  readonly connected: ReadonlyArray<ProviderId>;
  readonly onChange: (preference: RoleModelPreference | null) => void;
};

const row = ({ preference, connected, onChange }: RowParams) => (
  <RoleModelRow
    role="planner"
    label="Planner"
    help="plans the work"
    preference={preference}
    defaultProviderId="anthropic"
    connectedProviderIds={connected}
    disabled={false}
    onChange={onChange}
  />
);

const renderRow = ({ preference, onChange }: RenderParams) =>
  render(row({ preference, connected: CONNECTED, onChange }));

const openPrimary = () =>
  fireEvent.click(screen.getByRole('button', { name: /^Planner routing:/ }));

const openFallback = () =>
  fireEvent.click(screen.getByRole('button', { name: /^Planner fallback routing:/ }));

const pickProvider = (label: string) =>
  fireEvent.click(screen.getByRole('button', { name: label }));

const pickChip = (label: string) => {
  const [first] = screen.getAllByRole('button', { name: label });
  if (first === undefined) {
    throw new Error(`no chip labelled ${label}`);
  }
  fireEvent.click(first);
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('RoleModelRow', () => {
  it('moves a pinned role to another provider in one click', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    renderRow({
      preference: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'high' },
      onChange,
    });

    openPrimary();
    pickProvider('Cursor');

    expect(onChange).not.toHaveBeenCalledWith(null);
    for (const [preference] of onChange.mock.calls) {
      expect(preference?.providerId).toBe('cursor');
    }
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last?.providerId).toBe('cursor');
    expect(
      resolveStoredModelSelection({ provider: 'cursor', id: last?.model ?? '' }).selection.key,
    ).toBe('opus-5');
  });

  it('pins a role running on its compiled default to the provider picked', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    renderRow({ preference: null, onChange });

    openPrimary();
    pickProvider('Cursor');

    expect(onChange).not.toHaveBeenCalledWith(null);
    expect(onChange.mock.calls.at(-1)?.[0]?.providerId).toBe('cursor');
  });

  it('emits no preference the registry has to throw away', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    renderRow({
      preference: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'high' },
      onChange,
    });

    openPrimary();
    pickProvider('Cursor');

    expect(onChange.mock.calls.length).toBeGreaterThan(0);
    for (const [preference] of onChange.mock.calls) {
      expect(preference).not.toBeNull();
      const routed = resolveRoleRouting({
        role: 'planner',
        prefs: preference == null ? null : { planner: preference },
      });
      expect(routed.isOverride).toBe(true);
      expect(routed.provider).toBe(preference?.providerId);
    }
  });

  it('carries the fallback across a provider switch instead of dropping it', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    renderRow({
      preference: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
      },
      onChange,
    });

    openPrimary();
    pickProvider('Cursor');

    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      providerId: 'cursor',
      fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
    });
  });

  it('pins the fallback to the provider the user picked, not to a global model owner', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    renderRow({
      preference: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
      },
      onChange,
    });

    openFallback();
    pickProvider('Cursor');

    expect(onChange).not.toHaveBeenCalledWith(null);
    expect(onChange.mock.calls.at(-1)?.[0]?.fallback?.providerId).toBe('cursor');
  });

  it('keeps the role on the provider connected inline while the picker is open', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    const preference: RoleModelPreference = {
      providerId: 'anthropic',
      model: 'claude-opus-5',
      effort: 'high',
    };
    const view = render(row({ preference, connected: ANTHROPIC_ONLY, onChange }));

    openPrimary();
    pickProvider('Cursor');
    view.rerender(row({ preference, connected: CONNECTED, onChange }));
    pickChip('Auto');

    expect(onChange.mock.calls.length).toBeGreaterThan(0);
    for (const [emitted] of onChange.mock.calls) {
      expect(emitted).not.toBeNull();
      expect(emitted?.providerId).toBe('cursor');
      expect(emitted?.model).toBe('auto');
    }
  });

  it('keeps the fallback on the provider connected inline while the picker is open', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    const preference: RoleModelPreference = {
      providerId: 'anthropic',
      model: 'claude-opus-5',
      effort: 'high',
      fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
    };
    const view = render(row({ preference, connected: ANTHROPIC_ONLY, onChange }));

    openFallback();
    pickProvider('Cursor');
    view.rerender(row({ preference, connected: CONNECTED, onChange }));
    pickChip('Auto');

    expect(onChange).not.toHaveBeenCalledWith(null);
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      providerId: 'anthropic',
      model: 'opus-5',
      fallback: { providerId: 'cursor', model: 'auto' },
    });
  });

  it('tunes the effort of the model just picked, not of the model the props still carry', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    const preference: RoleModelPreference = {
      providerId: 'anthropic',
      model: 'claude-opus-5',
      effort: 'high',
    };
    const view = render(row({ preference, connected: ANTHROPIC_ONLY, onChange }));

    openPrimary();
    pickProvider('Cursor');
    view.rerender(row({ preference, connected: CONNECTED, onChange }));
    pickChip('Auto');

    expect(onChange.mock.calls.length).toBeGreaterThan(1);
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      providerId: 'cursor',
      model: 'auto',
      effort: 'low',
    });
  });

  it('tunes the effort of the model the props last delivered', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    const view = render(
      row({
        preference: { providerId: 'anthropic', model: 'claude-sonnet-4-6', effort: 'high' },
        connected: CONNECTED,
        onChange,
      }),
    );
    view.rerender(
      row({
        preference: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'high' },
        connected: CONNECTED,
        onChange,
      }),
    );

    openPrimary();
    pickChip('Low');

    expect(onChange.mock.calls.length).toBeGreaterThan(0);
    for (const [emitted] of onChange.mock.calls) {
      expect(emitted?.model).toBe('opus-5');
    }
  });

  it('keeps the role override when the fallback goes back to automatic', () => {
    const onChange = vi.fn<(preference: RoleModelPreference | null) => void>();
    renderRow({
      preference: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
      },
      onChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset routing override' }));

    expect(onChange).not.toHaveBeenCalledWith(null);
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      providerId: 'anthropic',
      model: 'opus-5',
    });
    expect(onChange.mock.calls.at(-1)?.[0]?.fallback).toBeUndefined();
  });
});
