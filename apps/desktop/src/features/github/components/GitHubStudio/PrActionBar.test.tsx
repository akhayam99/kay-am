import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PullRequestState } from '@goodboy/types';
import type { ActionBusy } from './PrActionBar';
import type { PrVerdictSubmission } from './PrVerdictAction';

type Params = {
  readonly pr?: PullRequestState;
  readonly canMerge?: boolean;
  readonly canReview?: boolean;
  readonly busy?: ActionBusy;
  readonly canCreateNew?: boolean;
  readonly onMerge?: () => Promise<void>;
  readonly onSubmitVerdict?: (submission: PrVerdictSubmission) => void;
};

const PR = {
  number: 42,
  title: 'Consolidate pull request controls',
  url: 'https://github.com/goodboy/goodboy/pull/42',
  state: 'open',
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'ak/consolidate-pr-controls',
  isDraft: false,
  reviewDecision: null,
  body: '',
  updatedAt: '2026-07-30T10:00:00Z',
} satisfies PullRequestState;

import { PrActionBar } from './PrActionBar';

const renderActionBar = ({
  pr = PR,
  canMerge = true,
  canReview = true,
  busy = null,
  canCreateNew = true,
  onMerge = vi.fn(async () => undefined),
  onSubmitVerdict = vi.fn(),
}: Params = {}) =>
  render(
    <PrActionBar
      pr={pr}
      busy={busy}
      canMerge={canMerge}
      canReview={canReview}
      mergeReason={canMerge ? 'squash merge this PR' : 'PR has conflicts, resolve them first'}
      onSubmitVerdict={onSubmitVerdict}
      onMarkReady={vi.fn()}
      onConvertDraft={vi.fn()}
      onClose={vi.fn()}
      onReopen={vi.fn()}
      canCreateNew={canCreateNew}
      onCreateNew={vi.fn()}
      onMerge={onMerge}
    />,
  );

afterEach(cleanup);

describe('PrActionBar', () => {
  it('requires the shared danger confirmation before merging', async () => {
    const onMerge = vi.fn(async () => undefined);
    renderActionBar({ onMerge });

    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    const confirmation = screen.getByRole('group', {
      name: 'Squash merge this pull request?',
    });
    expect(within(confirmation).getByText('This action cannot be undone.')).toBeDefined();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirm merge' }));

    await waitFor(() => expect(onMerge).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Squash merge this pull request?' })).toBeNull(),
    );
  });

  it('approves from the bar without asking for a summary', () => {
    const onSubmitVerdict = vi.fn();
    renderActionBar({ onSubmitVerdict });

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(onSubmitVerdict).toHaveBeenCalledWith({ verdict: 'approve', body: '' });
  });

  it('holds request changes until a summary is written', () => {
    const onSubmitVerdict = vi.fn();
    renderActionBar({ onSubmitVerdict });

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Review verdict' }), {
      target: { value: 'request_changes' },
    });

    expect(screen.getByRole('button', { name: 'Submit review' }).hasAttribute('disabled')).toBe(
      true,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Review summary' }), {
      target: { value: 'split this helper' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(onSubmitVerdict).toHaveBeenCalledWith({
      verdict: 'request_changes',
      body: 'split this helper',
    });
  });

  it('disables the review action while another write is in flight', () => {
    renderActionBar({ busy: 'merge' });

    expect(screen.getByRole('button', { name: 'Review' }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps merge gating on the launch action', () => {
    renderActionBar({ canMerge: false });

    const merge = screen.getByRole('button', { name: 'Merge' });
    expect(merge.hasAttribute('disabled')).toBe(true);
    expect(merge.getAttribute('title')).toBe('PR has conflicts, resolve them first');
  });

  it('replaces merge with the queue position once the PR is in the merge queue', () => {
    renderActionBar({ pr: { ...PR, state: 'queued', mergeQueue: { position: 3 } } });

    expect(screen.getByText('In merge queue')).toBeDefined();
    expect(screen.getByText('#3')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
  });

  it('calls auto-merge by its name instead of claiming a merge queue', () => {
    renderActionBar({ pr: { ...PR, state: 'queued', mergeQueue: null } });

    expect(screen.getByText('Auto-merge on')).toBeDefined();
    expect(screen.queryByText('In merge queue')).toBeNull();
  });
});

describe('PrActionBar create new', () => {
  it('blocks a second pull request while a drafting agent runs', () => {
    renderActionBar({
      pr: { ...PR, state: 'closed' },
      canCreateNew: false,
    });

    expect(screen.getByRole('button', { name: 'Create new PR' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
