// @vitest-environment happy-dom

import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SessionId } from '@goodboy/types';

const { store } = vi.hoisted(() => ({
  store: {
    upsertSessionSlot: vi.fn(async () => undefined),
    loadGoalAttachments: vi.fn(async () => undefined),
    removeGoalAttachment: vi.fn(async () => undefined),
    sessionAttachments: {},
    workflowRunAttachments: {},
    sessionWorktrees: {},
    currentSessionId: null,
  },
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (s: typeof store) => T) => selector(store),
  EMPTY_ARRAY: [],
}));

vi.mock('@goodboy/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/ui')>();
  return {
    ...actual,
    Tooltip: ({ content, children }: { content: string; children: ReactElement }) => (
      <span data-tooltip={content}>{children as ReactNode}</span>
    ),
  };
});

import { GoalOverviewRegion } from './GoalOverviewRegion';

const SESSION_ID = 'sess-1' as SessionId;

type RenderParams = {
  readonly value?: string;
  readonly historyCount?: number;
  readonly isLoading?: boolean;
  readonly onOpenHistory?: () => void;
};

const renderRegion = ({
  value = 'Ship the parser rewrite',
  historyCount = 2,
  isLoading = false,
  onOpenHistory = vi.fn(),
}: RenderParams = {}) =>
  render(
    <GoalOverviewRegion
      sessionId={SESSION_ID}
      value={value}
      historyCount={historyCount}
      isLoading={isLoading}
      isSummarizing={false}
      onOpenHistory={onOpenHistory}
    />,
  );

beforeEach(() => {
  store.upsertSessionSlot.mockClear();
});
afterEach(cleanup);

describe('GoalOverviewRegion', () => {
  it('renders goal markdown inside the click-to-edit region', () => {
    renderRegion({ value: 'Ship the **parser rewrite**' });
    const region = screen.getByRole('button', { name: 'Edit goal' });

    expect(region.querySelector('strong')?.textContent).toBe('parser rewrite');
    expect(region.textContent).not.toContain('**');
  });

  it('keeps history as the only section action', () => {
    renderRegion();
    const history = screen.getByRole('button', { name: /2 previous versions of Goal/i });

    expect(screen.getByText('Goal')).toBeDefined();
    expect(history.textContent).toContain('History');
    expect(screen.queryByRole('button', { name: /copy goal/i })).toBeNull();
  });

  it('reveals long prose in place without opening the editor', () => {
    const value = Array.from({ length: 60 }, () => 'parser').join(' ');
    renderRegion({ value });

    const toggle = screen.getByRole('button', { name: 'Show more' });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Goal' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getByRole('button', { name: 'Show more' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Goal' })).toBeNull();
  });

  it('does not intercept a link click as an edit gesture', () => {
    renderRegion({ value: 'Read the [design notes](https://example.com/design)' });
    const link = screen.getByRole('link', { name: 'design notes' });
    link.addEventListener('click', (event) => event.preventDefault());

    fireEvent.click(link);
    expect(screen.queryByRole('textbox', { name: 'Goal' })).toBeNull();
  });

  it('enters edit from a click on the text, with no edit button', () => {
    renderRegion();

    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    expect(screen.getByRole('textbox', { name: 'Goal' })).toBeDefined();
  });

  it('reaches edit from the keyboard', () => {
    renderRegion();
    const text = screen.getByRole('button', { name: 'Edit goal' });

    expect(text.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(text, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Goal' })).toBeDefined();
  });

  it('does not enter edit when the click ended a text selection', () => {
    renderRegion();
    const selection = { isCollapsed: false, toString: () => 'parser' };
    const original = window.getSelection;
    window.getSelection = () => selection as unknown as Selection;
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    window.getSelection = original;

    expect(screen.queryByRole('textbox', { name: 'Goal' })).toBeNull();
  });

  it('opens history from the section action', () => {
    const onOpenHistory = vi.fn();
    renderRegion({ onOpenHistory });

    fireEvent.click(screen.getByRole('button', { name: /2 previous versions of Goal/i }));
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it('uses an accessible skeleton while the goal loads', () => {
    renderRegion({ isLoading: true });

    expect(screen.getByRole('status', { name: 'Loading goal' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Edit goal' })).toBeNull();
  });

  it('saves the edit on the platform commit chord', () => {
    renderRegion();
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    const input = screen.getByRole('textbox', { name: 'Goal' });
    fireEvent.change(input, { target: { value: 'Ship the parser' } });
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });

    expect(store.upsertSessionSlot).toHaveBeenCalledWith(SESSION_ID, 'goal', 'Ship the parser');
  });

  it('keeps a bare Enter free to type a newline, so a multi-line goal survives editing', () => {
    renderRegion({ value: 'Ship the parser\n\n- keep the old lexer\n- land behind a flag' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
    const input = screen.getByRole('textbox', { name: 'Goal' });

    expect((input as HTMLTextAreaElement).value).toContain('\n- keep the old lexer');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.upsertSessionSlot).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(store.upsertSessionSlot).not.toHaveBeenCalled();
  });
});
