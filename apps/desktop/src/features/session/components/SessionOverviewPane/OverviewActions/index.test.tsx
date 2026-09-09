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
  it('gives workflow and agent creation a section each, one action apiece', () => {
    const onOpenWorkflowBuilder = vi.fn();
    render(
      <OverviewActions sessionId={SESSION_ID} onOpenWorkflowBuilder={onOpenWorkflowBuilder} />,
    );

    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Agents' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add workflow' }));
    expect(screen.getByRole('button', { name: 'New agent' })).toBeDefined();
    expect(onOpenWorkflowBuilder).toHaveBeenCalledOnce();
  });

  it('carries no resolve control of any kind', () => {
    render(<OverviewActions sessionId={SESSION_ID} onOpenWorkflowBuilder={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start resolve run' })).toBeNull();
  });
});
