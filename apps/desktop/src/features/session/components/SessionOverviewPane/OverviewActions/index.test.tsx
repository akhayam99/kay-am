import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionId } from '@goodboy/types';

vi.mock('../../CreateAgentPopover', () => ({
  CreateAgentPopover: () => <button type="button">New agent</button>,
}));

import { OverviewActions } from './index';

const SESSION_ID: SessionId = JSON.parse(JSON.stringify('session-1'));

afterEach(cleanup);

describe('OverviewActions', () => {
  it('keeps workflow and agent creation permanently mounted in the activity header', () => {
    const onOpenWorkflowBuilder = vi.fn();
    render(
      <OverviewActions sessionId={SESSION_ID} onOpenWorkflowBuilder={onOpenWorkflowBuilder} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add workflow' }));
    expect(screen.getByRole('button', { name: 'New agent' })).toBeDefined();
    expect(onOpenWorkflowBuilder).toHaveBeenCalledOnce();
  });
});
