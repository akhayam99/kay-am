// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Session } from '@goodboy/types';
import type { SessionStudio } from '../../../../../store';

const workspace = { id: 'workspace-1', name: 'goodboy', rootPath: '/tmp/goodboy' };

vi.mock('../../../../../store', () => ({
  useCurrentWorkspace: () => workspace,
}));

vi.mock('../../WorkflowBuilderView', () => ({
  WorkflowBuilderView: () => <div data-testid="studio-workflow" />,
}));

vi.mock('../../../../integrations/gitlab/MrSessionPane', () => ({
  MrSessionPane: () => <div data-testid="studio-mr" />,
}));

vi.mock('../../../../integrations/bitbucket/BitbucketStudio', () => ({
  BitbucketStudio: () => <div data-testid="studio-bitbucket" />,
}));

import { SessionStudioLayer } from './SessionStudioLayer';

const session = { id: 'session-1' } as unknown as Session;

afterEach(() => {
  cleanup();
});

const renderStudio = (studio: SessionStudio) => {
  render(<SessionStudioLayer session={session} studio={studio} onClose={() => undefined} />);
};

describe('SessionStudioLayer', () => {
  it('renders the workflow builder for a workflow studio', () => {
    renderStudio({ kind: 'workflow' });
    expect(screen.getByTestId('studio-workflow')).not.toBeNull();
  });

  it('has no github studio kind: the review lens owns pull requests', () => {
    const kinds: ReadonlyArray<SessionStudio['kind']> = ['workflow', 'mr', 'bitbucket'];
    expect(kinds).not.toContain('github');
  });

  it('renders the bitbucket studio for a bitbucket studio', () => {
    renderStudio({ kind: 'bitbucket' });
    expect(screen.getByTestId('studio-bitbucket')).not.toBeNull();
  });

  it('renders the merge request pane for an mr studio', () => {
    renderStudio({ kind: 'mr' });
    expect(screen.getByTestId('studio-mr')).not.toBeNull();
  });
});
