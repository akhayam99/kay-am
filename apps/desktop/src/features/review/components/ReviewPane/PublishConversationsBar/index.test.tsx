// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ResolvePublicationPreview } from '@goodboy/types';
import { PublishConversationsBar } from './index';

afterEach(cleanup);

const previewOf = (patch: Partial<ResolvePublicationPreview>): ResolvePublicationPreview => ({
  publicationId: 'pub-1',
  repo: 'acme/web',
  prNumber: 248,
  branch: 'feature/retry',
  localHead: 'c3d4e5f00000',
  remoteHead: '9f8e7d600000',
  requiresPush: true,
  commits: [],
  replies: [],
  excluded: [],
  blocker: null,
  ...patch,
});

const commitOf = ({
  sha,
  subject,
  threadIds,
}: {
  readonly sha: string;
  readonly subject: string;
  readonly threadIds: ReadonlyArray<string>;
}) =>
  ({
    sha,
    shortSha: sha.slice(0, 7),
    subject,
    pushed: false,
    threadIds,
  }) as ResolvePublicationPreview['commits'][number];

const renderBar = (overrides: Partial<Parameters<typeof PublishConversationsBar>[0]> = {}) =>
  render(
    <PublishConversationsBar
      readyCount={3}
      selectedCount={0}
      selectedReadyCount={0}
      draftCount={0}
      isWriteReviewActive={false}
      preview={null}
      titleByThreadId={
        new Map([
          ['t1', 'retry.ts:84'],
          ['t2', 'parser.ts:31'],
        ])
      }
      staleNote={null}
      progress={null}
      isBusy={false}
      onPublish={vi.fn()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      onViewChanges={vi.fn()}
      onBlockerAction={vi.fn()}
      onWriteReview={vi.fn()}
      {...overrides}
    />,
  );

describe('PublishConversationsBar', () => {
  it('disables Publish all and says why when nothing is ready', () => {
    renderBar({ readyCount: 0 });

    const button = screen.getByRole('button', { name: 'Publish all (0)' });
    expect(button.getAttribute('disabled')).not.toBeNull();
    expect(button.getAttribute('title')).toBe('Nothing ready to publish');
  });

  it('hides the selected verb until something ready is selected', () => {
    const { rerender } = renderBar();
    expect(screen.queryByRole('button', { name: /Publish selected/ })).toBeNull();

    rerender(
      <PublishConversationsBar
        readyCount={3}
        selectedCount={2}
        selectedReadyCount={2}
        draftCount={0}
        isWriteReviewActive={false}
        preview={null}
        titleByThreadId={new Map()}
        staleNote={null}
        progress={null}
        isBusy={false}
        onPublish={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onViewChanges={vi.fn()}
        onBlockerAction={vi.fn()}
        onWriteReview={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Publish selected (2)' })).toBeDefined();
  });

  it('says no code will be pushed on an answer-only publication', () => {
    renderBar({
      preview: previewOf({
        requiresPush: false,
        replies: [{ threadId: 't1', body: 'reason', revision: 1, closes: true }],
      }),
    });

    expect(
      screen.getByText('Post 1 reply and resolve 1 conversation. No code will be pushed.'),
    ).toBeDefined();
  });

  it('names the conversations a commit closes and states plainly when a commit closes none', () => {
    renderBar({
      preview: previewOf({
        commits: [
          commitOf({ sha: 'a1b2c3d0000', subject: 'fix: return early', threadIds: ['t1', 't2'] }),
          commitOf({ sha: 'c3d4e5f0000', subject: 'chore: bump lockfile', threadIds: [] }),
        ],
        replies: [{ threadId: 't1', body: 'body', revision: 1, closes: true }],
      }),
    });

    expect(screen.getByText('retry.ts:84, parser.ts:31')).toBeDefined();
    expect(screen.getByText('not tied to a selected conversation')).toBeDefined();
  });

  it('counts the conversations that need you before they can be published', () => {
    renderBar({
      preview: previewOf({
        excluded: [
          { threadId: 'a', reason: 'needs_you' },
          { threadId: 'b', reason: 'working' },
        ],
      }),
    });

    expect(screen.getByText('2 conversations need you first.')).toBeDefined();
  });

  it('replaces confirm with the blocker and the one action that clears it', () => {
    const onBlockerAction = vi.fn();
    renderBar({ preview: previewOf({ blocker: 'dirty_tree' }), onBlockerAction });

    expect(screen.getByText('Worktree has uncommitted changes')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Confirm publish' }).getAttribute('disabled'),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open diff' }));
    expect(onBlockerAction).toHaveBeenCalledWith('open_diff');
  });

  it('refuses a concurrent publication on the same pull request with no way through', () => {
    renderBar({ preview: previewOf({ blocker: 'publication_in_progress' }) });

    expect(screen.getByText('Another publication is in progress for #248')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Open diff' })).toBeNull();
  });

  it('announces publication progress politely', () => {
    renderBar({ progress: { sentence: 'Posting reply 2 of 6', elapsed: '0:41' } });

    const line = screen.getByText('Posting reply 2 of 6');
    expect(line.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByText('0:41')).toBeDefined();
  });

  it('keeps the write review flow one click away and shows its draft count', () => {
    const onWriteReview = vi.fn();
    renderBar({ draftCount: 2, onWriteReview });

    fireEvent.click(screen.getByRole('button', { name: 'Write review (2)' }));
    expect(onWriteReview).toHaveBeenCalledTimes(1);
  });

  it('never renders a dialog', () => {
    renderBar({ preview: previewOf({}) });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
