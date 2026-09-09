// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { useResolveItemDraft } from './index';

const sessionId = 'session-1' as SessionId;

type HarnessProps = {
  readonly threadId: string;
  readonly proposal: string | null;
};

const DraftHarness = ({ threadId, proposal }: HarnessProps) => {
  const draft = useResolveItemDraft({ sessionId, threadId, proposal });
  return (
    <div>
      <textarea
        aria-label="Reply to reviewer"
        value={draft.reply}
        onChange={(event) => draft.setReply(event.target.value)}
      />
      <textarea
        aria-label="Instructions for agent"
        value={draft.instruction}
        onChange={(event) => draft.setInstruction(event.target.value)}
      />
      <span data-testid="mode">{draft.mode}</span>
      <button type="button" onClick={() => draft.setMode('refuse')}>
        Will not fix
      </button>
    </div>
  );
};

type QueueProps = {
  readonly proposalOfRetry: string | null;
};

const QueueHarness = ({ proposalOfRetry }: QueueProps) => {
  const [threadId, setThreadId] = useState('t-retry');
  return (
    <div>
      <button type="button" onClick={() => setThreadId('t-parser')}>
        Open parser
      </button>
      <button type="button" onClick={() => setThreadId('t-retry')}>
        Open retry
      </button>
      <DraftHarness
        key={threadId}
        threadId={threadId}
        proposal={threadId === 't-retry' ? proposalOfRetry : 'The parser draft.'}
      />
    </div>
  );
};

const reply = (): HTMLTextAreaElement =>
  screen.getByLabelText('Reply to reviewer') as HTMLTextAreaElement;

const type = ({ value }: { readonly value: string }): void => {
  fireEvent.change(reply(), { target: { value } });
};

beforeEach(() => {
  useAppStore.setState({ resolveItemDrafts: {} });
});

afterEach(cleanup);

describe('the reply a maintainer is writing to a reviewer', () => {
  it('starts from the agent proposal until the maintainer touches it', () => {
    render(<DraftHarness threadId="t-retry" proposal="Added the early return." />);

    expect(reply().value).toBe('Added the early return.');
  });

  it('survives navigating to another comment and back', () => {
    render(<QueueHarness proposalOfRetry="Added the early return." />);

    type({ value: 'I would rather cap the attempts.' });
    fireEvent.click(screen.getByRole('button', { name: 'Open parser' }));

    expect(reply().value).toBe('The parser draft.');

    fireEvent.click(screen.getByRole('button', { name: 'Open retry' }));

    expect(reply().value).toBe('I would rather cap the attempts.');
  });

  it('keeps what the maintainer wrote when a new proposal lands mid edit', () => {
    const view = render(<QueueHarness proposalOfRetry="Added the early return." />);

    type({ value: 'I would rather cap the attempts.' });
    view.rerender(<QueueHarness proposalOfRetry="Reworked the retry loop entirely." />);

    expect(reply().value).toBe('I would rather cap the attempts.');
  });

  it('follows a new proposal while the maintainer has written nothing', () => {
    const view = render(<QueueHarness proposalOfRetry="Added the early return." />);

    view.rerender(<QueueHarness proposalOfRetry="Reworked the retry loop entirely." />);

    expect(reply().value).toBe('Reworked the retry loop entirely.');
  });

  it('keeps an emptied reply empty rather than restoring the proposal', () => {
    render(<DraftHarness threadId="t-retry" proposal="Added the early return." />);

    type({ value: '' });

    expect(reply().value).toBe('');
  });

  it('holds the instruction and the decision mode per comment', () => {
    render(<QueueHarness proposalOfRetry={null} />);

    fireEvent.change(screen.getByLabelText('Instructions for agent'), {
      target: { value: 'Cap the attempts at three.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Will not fix' }));

    expect(screen.getByTestId('mode').textContent).toBe('refuse');

    fireEvent.click(screen.getByRole('button', { name: 'Open parser' }));

    expect(screen.getByTestId('mode').textContent).toBe('reply');
    expect((screen.getByLabelText('Instructions for agent') as HTMLTextAreaElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Open retry' }));

    expect(screen.getByTestId('mode').textContent).toBe('refuse');
    expect((screen.getByLabelText('Instructions for agent') as HTMLTextAreaElement).value).toBe(
      'Cap the attempts at three.',
    );
  });

  it('keeps one session out of another session drafts', () => {
    render(<DraftHarness threadId="t-retry" proposal={null} />);

    type({ value: 'Mine alone.' });

    expect(useAppStore.getState().resolveItemDrafts['session-2' as SessionId]).toBeUndefined();
  });
});
