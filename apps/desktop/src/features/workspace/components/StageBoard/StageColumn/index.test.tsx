// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Session, SessionId } from '@goodboy/types';
import type { MultiSelect } from '../../../../../shared/hooks/useMultiSelect';
import type { BoardNavigation } from '../useBoardNavigation';

vi.mock('../StageBoardCard', () => ({
  StageBoardCard: ({
    session,
    selected,
    onModifierClick,
  }: {
    readonly session: Session;
    readonly selected?: boolean;
    readonly onModifierClick?: (id: SessionId, event: { readonly altKey: boolean }) => void;
  }) => (
    <button
      type="button"
      aria-pressed={selected === true}
      aria-label={`card ${session.goal}`}
      onClick={(event) => onModifierClick?.(session.id as SessionId, event)}
    />
  ),
}));

import { StageColumn } from './index';

const nav = {} as BoardNavigation;

const makeSession = (id: string, goal: string): Session =>
  ({ id: id as SessionId, goal }) as unknown as Session;

const noop = () => undefined;

const makeSelection = (over: Partial<MultiSelect<SessionId>> = {}): MultiSelect<SessionId> => ({
  selected: [],
  isSelected: () => false,
  toggle: noop,
  selectRange: noop,
  selectAll: noop,
  clear: noop,
  selectIds: noop,
  handleItemClick: noop,
  ...over,
});

const renderColumn = (
  sessions: ReadonlyArray<Session>,
  selection: MultiSelect<SessionId> = makeSelection(),
  spec: Parameters<typeof StageColumn>[0]['spec'] = { kind: 'stage', stage: 'building' },
) =>
  render(
    <StageColumn
      spec={spec}
      sessions={sessions}
      nav={nav}
      selection={selection}
      onArchive={noop}
      onDelete={noop}
      onRestore={noop}
    />,
  );

afterEach(cleanup);

describe('StageColumn', () => {
  it('renders only the muted label for an empty column', () => {
    const { container } = renderColumn([]);
    expect(screen.getByText('building').className).toContain('text-muted-foreground/60');
    expect(screen.queryByText('nothing building')).toBeNull();
    expect(container.querySelector('.tabular-nums')).toBeNull();
  });

  it('renders the count and the stage tint once the column has cards', () => {
    renderColumn([makeSession('s-1', 'one')]);
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('building').className).not.toContain('text-muted-foreground/60');

    cleanup();
    renderColumn([makeSession('s-1', 'one')], makeSelection(), {
      kind: 'stage',
      stage: 'running',
    });
    expect(screen.getByText('running').className).toContain('text-info');
  });

  it('starts collapsed for done and archived, open otherwise', () => {
    renderColumn([makeSession('s-1', 'one')], makeSelection(), { kind: 'stage', stage: 'done' });
    expect(screen.getByRole('button', { name: /done/ }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.queryByRole('button', { name: 'card one' })).toBeNull();

    cleanup();
    renderColumn([makeSession('s-1', 'one')], makeSelection(), { kind: 'archived' });
    expect(screen.getByRole('button', { name: /archived/ }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.queryByRole('button', { name: 'card one' })).toBeNull();

    cleanup();
    renderColumn([makeSession('s-1', 'one')]);
    expect(screen.getByRole('button', { name: 'card one' })).toBeDefined();
  });

  it('renders no native title on the collapse control', () => {
    renderColumn([makeSession('s-1', 'one')], makeSelection(), { kind: 'stage', stage: 'done' });
    expect(screen.getByRole('button', { name: /done/ }).hasAttribute('title')).toBe(false);
  });

  it('marks the cards the board selection owns', () => {
    renderColumn(
      [makeSession('s-1', 'one'), makeSession('s-2', 'two')],
      makeSelection({ isSelected: (id) => id === ('s-2' as SessionId) }),
    );

    expect(screen.getByRole('button', { name: 'card one' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'card two' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('routes a modifier click straight to the board selection', () => {
    const handleItemClick = vi.fn();
    renderColumn([makeSession('s-1', 'one')], makeSelection({ handleItemClick }));

    fireEvent.click(screen.getByRole('button', { name: 'card one' }), { altKey: true });

    expect(handleItemClick).toHaveBeenCalledWith('s-1', expect.anything());
  });

  it('clears the archived selection when the archived column collapses', () => {
    const clear = vi.fn();
    renderColumn([makeSession('s-1', 'one')], makeSelection({ clear }), { kind: 'archived' });
    const header = screen.getByRole('button', { name: /archived/ });

    fireEvent.click(header);
    clear.mockClear();
    fireEvent.click(header);

    expect(clear).toHaveBeenCalled();
  });

  it('leaves the active selection alone when a stage column collapses', () => {
    const clear = vi.fn();
    renderColumn([makeSession('s-1', 'one')], makeSelection({ clear }), {
      kind: 'stage',
      stage: 'done',
    });
    const header = screen.getByRole('button', { name: /done/ });

    fireEvent.click(header);
    clear.mockClear();
    fireEvent.click(header);

    expect(clear).not.toHaveBeenCalled();
  });
});
