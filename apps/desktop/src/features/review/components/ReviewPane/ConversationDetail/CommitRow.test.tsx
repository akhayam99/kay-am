// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BranchCommit } from '@goodboy/types';
import { CommitRow } from './CommitRow';

const COMMIT = {
  sha: 'abcdef1234567890',
  shortSha: 'abcdef1',
  subject: 'guard the null case',
  author: 'dev',
  timestamp: 1,
  pushed: false,
  parentSha: null,
} satisfies BranchCommit;

const LINK_AFFORDANCE = [
  'cursor-pointer',
  'underline-offset-2',
  'hover:underline',
  'hover:text-foreground',
];

afterEach(cleanup);

describe('CommitRow', () => {
  it('reads as an in-app link when it can open the diff', () => {
    const onOpen = vi.fn();
    render(<CommitRow commit={COMMIT} onOpen={onOpen} />);
    const button = screen.getByTitle('Open the diff of abcdef1');
    LINK_AFFORDANCE.forEach((token) => expect(button.className).toContain(token));
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('stays a plain row without a handler', () => {
    render(<CommitRow commit={COMMIT} />);
    expect(screen.queryByRole('button')).toBeNull();
    const row = screen.getByText('abcdef1').parentElement;
    LINK_AFFORDANCE.forEach((token) => expect(row?.className ?? '').not.toContain(token));
  });
});
