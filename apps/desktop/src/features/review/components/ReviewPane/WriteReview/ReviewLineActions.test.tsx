// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReviewLineTarget } from './ReviewFileDiff';
import { ReviewLineActions } from './ReviewLineActions';

const TARGET: ReviewLineTarget = {
  path: 'src/a.ts',
  line: 4,
  side: 'new',
  text: 'retry(session);',
};

afterEach(cleanup);

describe('ReviewLineActions', () => {
  it('reveals both actions on keyboard focus, not only on hover', () => {
    render(
      <ReviewLineActions
        target={TARGET}
        isActive={false}
        onToggleComposer={vi.fn()}
        onAskAgent={vi.fn()}
      />,
    );

    const draftButton = screen.getByRole('button', { name: 'Draft a comment on new line 4' });
    const askAgentButton = screen.getByRole('button', { name: 'Ask the agent about new line 4' });
    expect(draftButton.className).toContain('focus-visible:opacity-100');
    expect(askAgentButton.className).toContain('focus-visible:opacity-100');
  });

  it('renders nothing without a target', () => {
    const { container } = render(
      <ReviewLineActions
        target={null}
        isActive={false}
        onToggleComposer={vi.fn()}
        onAskAgent={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
