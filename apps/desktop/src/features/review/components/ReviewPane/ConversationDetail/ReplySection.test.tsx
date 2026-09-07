// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReplySection } from './ReplySection';

afterEach(cleanup);

describe('ReplySection', () => {
  it('saves an edited reply on blur, without a save button', () => {
    const onSave = vi.fn();
    render(
      <ReplySection
        threadId="t1"
        reply="Added the early return."
        isClosingReason={false}
        isReadOnly={false}
        onSave={onSave}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    const field = screen.getByRole('textbox', { name: 'Proposed reply' });
    fireEvent.change(field, { target: { value: 'Added the early return and a test.' } });
    fireEvent.blur(field);

    expect(onSave).toHaveBeenCalledWith({
      threadId: 't1',
      reply: 'Added the early return and a test.',
    });
  });

  it('commits on Escape rather than throwing the edit away', () => {
    const onSave = vi.fn();
    render(
      <ReplySection
        threadId="t1"
        reply="Original."
        isClosingReason={false}
        isReadOnly={false}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    const field = screen.getByRole('textbox', { name: 'Proposed reply' });
    fireEvent.change(field, { target: { value: 'Revised.' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onSave).toHaveBeenCalledWith({ threadId: 't1', reply: 'Revised.' });
  });

  it('does not save when the text came back unchanged', () => {
    const onSave = vi.fn();
    render(
      <ReplySection
        threadId="t1"
        reply="Same."
        isClosingReason={false}
        isReadOnly={false}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    fireEvent.blur(screen.getByRole('textbox', { name: 'Proposed reply' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('offers an empty writing field on a conversation with no reply yet', () => {
    const onSave = vi.fn();
    render(
      <ReplySection
        threadId="t1"
        reply={null}
        isClosingReason={false}
        isReadOnly={false}
        onSave={onSave}
      />,
    );

    const field = screen.getByRole('textbox', { name: 'Write reply' });
    fireEvent.change(field, { target: { value: 'No change needed here.' } });
    fireEvent.blur(field);

    expect(onSave).toHaveBeenCalledWith({ threadId: 't1', reply: 'No change needed here.' });
  });

  it('calls a no-change closure a closing reason', () => {
    render(
      <ReplySection
        threadId="t1"
        reply="Follows the convention of every sibling route."
        isClosingReason
        isReadOnly={false}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Closing reason')).toBeDefined();
  });

  it('renders a resolved conversation read only', () => {
    render(
      <ReplySection
        threadId="t1"
        reply="Posted already."
        isClosingReason={false}
        isReadOnly
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit reply' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
