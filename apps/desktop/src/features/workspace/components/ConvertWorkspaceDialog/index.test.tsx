// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Workspace } from '@goodboy/types';

const { state, listOwnedRepos, createGithubRepo } = vi.hoisted(() => ({
  state: {
    githubStatus: { available: true, user: 'acme' } as {
      available: boolean;
      user?: string;
    } | null,
    workspaceIntegrations: {} as Record<string, ReadonlyArray<{ provider: string }>>,
    projects: [
      { id: 'project-1', workspaceId: 'ws-1', kind: 'folder', rootPath: '/tmp/study-space' },
    ],
    convertProjectToRepo: vi.fn(async () => undefined),
  },
  listOwnedRepos: vi.fn(),
  createGithubRepo: vi.fn(),
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (store: typeof state) => T) => selector(state),
}));

vi.mock('@goodboy/core', async () => {
  const actual = await vi.importActual<typeof import('@goodboy/core')>('@goodboy/core');
  return {
    listOwnedRepos,
    createGithubRepo,
    validateGithubRepoName: actual.validateGithubRepoName,
  };
});

vi.mock('../../../github/github', () => ({ tauriGhRunner: {} }));

import { ConvertWorkspaceDialog } from './index';

const workspace = {
  id: 'ws-1',
  name: 'Study space',
  sessionsRoot: '/tmp/study-space',
} as unknown as Workspace;

beforeEach(() => {
  state.githubStatus = { available: true, user: 'acme' };
  state.workspaceIntegrations = {};
  state.convertProjectToRepo.mockReset();
  state.convertProjectToRepo.mockResolvedValue(undefined);
  createGithubRepo.mockReset();
  createGithubRepo.mockResolvedValue({
    kind: 'ok',
    repo: {
      nameWithOwner: 'acme/study-space',
      url: 'https://github.com/acme/study-space',
      sshUrl: 'git@github.com:acme/study-space.git',
      isPrivate: true,
    },
  });
  listOwnedRepos.mockReset();
  listOwnedRepos.mockResolvedValue({
    kind: 'ok',
    repos: [
      {
        nameWithOwner: 'acme/widgets',
        url: 'https://github.com/acme/widgets',
        sshUrl: 'git@github.com:acme/widgets.git',
        isPrivate: false,
      },
    ],
  });
});

afterEach(cleanup);

describe('ConvertWorkspaceDialog', () => {
  it('converts with the repository the user picked', async () => {
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Link existing' }));
    await waitFor(() => screen.getByRole('option', { name: 'acme/widgets' }));
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/widgets' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convert to dev project' }));

    await waitFor(() =>
      expect(state.convertProjectToRepo).toHaveBeenCalledWith({
        projectId: 'project-1',
        remoteUrl: 'https://github.com/acme/widgets',
      }),
    );
    await waitFor(() => screen.getByRole('button', { name: 'Done' }));
  });

  it('blocks the conversion until the chosen host is connected', () => {
    state.githubStatus = { available: false };
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Link existing' }));
    expect(screen.getByText('GitHub is not connected yet')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Convert to dev project' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('takes a pasted remote url for GitLab', async () => {
    state.workspaceIntegrations = { 'ws-1': [{ provider: 'gitlab' }] };
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Link existing' }));
    fireEvent.click(screen.getByRole('tab', { name: 'GitLab' }));
    fireEvent.change(screen.getByPlaceholderText('https://gitlab.com/owner/repo.git'), {
      target: { value: 'git@gitlab.com:acme/widgets.git' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Convert to dev project' }));

    await waitFor(() =>
      expect(state.convertProjectToRepo).toHaveBeenCalledWith({
        projectId: 'project-1',
        remoteUrl: 'git@gitlab.com:acme/widgets.git',
      }),
    );
  });

  it('never sends the GitHub selection after the user switches to GitLab', async () => {
    state.workspaceIntegrations = { 'ws-1': [{ provider: 'gitlab' }] };
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Link existing' }));
    await waitFor(() => screen.getByRole('option', { name: 'acme/widgets' }));
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/widgets' } });
    fireEvent.click(screen.getByRole('tab', { name: 'GitLab' }));

    expect(
      screen.getByRole('button', { name: 'Convert to dev project' }).hasAttribute('disabled'),
    ).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('https://gitlab.com/owner/repo.git'), {
      target: { value: 'git@gitlab.com:acme/widgets.git' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Convert to dev project' }));

    await waitFor(() =>
      expect(state.convertProjectToRepo).toHaveBeenCalledWith({
        projectId: 'project-1',
        remoteUrl: 'git@gitlab.com:acme/widgets.git',
      }),
    );
  });

  it('says the cli is signed out instead of pretending the account is empty', async () => {
    listOwnedRepos.mockResolvedValue({ kind: 'unauthenticated' });
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Link existing' }));
    await waitFor(() => screen.getByText('the GitHub CLI is installed but not signed in'));
    expect(
      screen.getByRole('button', { name: 'Convert to dev project' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('says the account owns no repositories when gh answers with an empty list', async () => {
    listOwnedRepos.mockResolvedValue({ kind: 'ok', repos: [] });
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Link existing' }));
    await waitFor(() => screen.getByText('this account owns no repositories yet'));
  });

  it('keeps the draft when the user leaves to connect the host', () => {
    const onClose = vi.fn();
    const onOpenSettings = vi.fn();
    window.addEventListener('goodboy:open-settings', onOpenSettings);
    state.githubStatus = { available: false };
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={onClose} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Link existing' }));
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo.git'), {
      target: { value: 'https://github.com/acme/widgets.git' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));
    window.removeEventListener('goodboy:open-settings', onOpenSettings);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { scope: 'tools', tool: 'github' } }),
    );
    expect(
      (screen.getByPlaceholderText('https://github.com/owner/repo.git') as HTMLInputElement).value,
    ).toBe('https://github.com/acme/widgets.git');
  });

  it('picks no visibility for the user and refuses to create until one is chosen', () => {
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Public' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Private' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Create repository' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('names the destination and the visibility in one sentence before creating', async () => {
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Private' }));

    expect(
      screen.getByText(
        "Create acme/study-space as a private repository and set it as this folder's origin remote.",
      ),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Create repository' }));

    await waitFor(() =>
      expect(createGithubRepo).toHaveBeenCalledWith({
        runner: {},
        name: 'study-space',
        owner: 'acme',
        visibility: 'private',
      }),
    );
    await waitFor(() =>
      expect(state.convertProjectToRepo).toHaveBeenCalledWith({
        projectId: 'project-1',
        remoteUrl: 'https://github.com/acme/study-space',
      }),
    );
  });

  it('rejects a repository name starting with a dash instead of cleaning it up', () => {
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Repository name'), {
      target: { value: '--upstream=evil' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Public' }));

    expect(screen.getByRole('alert').textContent).toBe(
      'A repository name cannot start with a dash.',
    );
    expect((screen.getByLabelText('Repository name') as HTMLInputElement).value).toBe(
      '--upstream=evil',
    );
    expect(screen.getByRole('button', { name: 'Create repository' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('shows what gh said and leaves the workspace alone when the creation fails', async () => {
    createGithubRepo.mockResolvedValue({
      kind: 'failed',
      message: 'GraphQL: Name already exists on this account',
    });
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Public' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create repository' }));

    await waitFor(() => screen.getByText('GraphQL: Name already exists on this account'));
    expect(state.convertProjectToRepo).not.toHaveBeenCalled();
  });

  it('sets no remote when what GitHub returned is not what was asked for', async () => {
    createGithubRepo.mockResolvedValue({
      kind: 'mismatch',
      expected: { nameWithOwner: 'acme/study-space', isPrivate: true },
      actual: {
        nameWithOwner: 'acme/study-space',
        url: 'https://github.com/acme/study-space',
        sshUrl: 'git@github.com:acme/study-space.git',
        isPrivate: false,
      },
    });
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Private' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create repository' }));

    await waitFor(() => screen.getByText(/GitHub returned acme\/study-space, a public repository/));
    expect(screen.getByText(/was not removed/)).toBeDefined();
    expect(state.convertProjectToRepo).not.toHaveBeenCalled();
  });

  it('discloses the repository left on the account when the local half fails', async () => {
    state.convertProjectToRepo.mockRejectedValue(new Error('git init refused'));
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Private' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create repository' }));

    const disclosure = await screen.findByRole('status');
    expect(disclosure.textContent).toContain('acme/study-space');
    expect(disclosure.textContent).toContain('https://github.com/acme/study-space');
    expect(disclosure.textContent).toContain('was not removed');
    expect(screen.getByText('git init refused')).toBeDefined();
  });

  it('reports an unverified creation without pretending it succeeded', async () => {
    createGithubRepo.mockResolvedValue({
      kind: 'unverified',
      nameWithOwner: 'acme/study-space',
      message:
        'Goodboy created acme/study-space on GitHub but could not read it back: HTTP 502. It exists on GitHub and was not removed.',
    });
    render(<ConvertWorkspaceDialog open workspace={workspace} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Public' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create repository' }));

    await waitFor(() => screen.getByText(/could not read it back/));
    expect(state.convertProjectToRepo).not.toHaveBeenCalled();
  });
});
