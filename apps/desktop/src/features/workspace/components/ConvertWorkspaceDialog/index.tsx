import { openToolSettings } from '../../../integrations/openToolSettings';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, formatError, Input, SegmentedTabs, Select, StatusDot } from '@goodboy/ui';
import type { Workspace } from '@goodboy/types';
import {
  createGithubRepo,
  listOwnedRepos,
  validateGithubRepoName,
  type GithubRepoRef,
  type GithubRepoVisibility,
  type OwnedReposResult,
} from '@goodboy/core';
import { Check, GitBranch } from 'lucide-react';
import { useAppStore } from '../../../../store';
import { tauriGhRunner } from '../../../github/github';
import { lastPathSegment } from '../WorkspaceLinkForm/lastPathSegment';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly open: boolean;
  readonly workspace: Workspace;
  readonly onClose: () => void;
};

type Host = 'github' | 'gitlab';

type Action = 'create' | 'link';

type ReposState = OwnedReposResult | { readonly kind: 'idle' } | { readonly kind: 'loading' };

const HOST_NAME: Record<Host, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
};

const ACTION_OPTIONS = [
  { value: 'create', label: 'Create new' },
  { value: 'link', label: 'Link existing' },
] as const;

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
] as const;

const HOST_URL_PLACEHOLDER: Record<Host, string> = {
  github: 'https://github.com/owner/repo.git',
  gitlab: 'https://gitlab.com/owner/repo.git',
};

const MANUAL_REPO = '__manual__';

const NO_REPOS: ReadonlyArray<GithubRepoRef> = [];

const repoDestination = ({
  owner,
  name,
}: {
  readonly owner: string | null;
  readonly name: string;
}): string => (owner === null ? name : `${owner}/${name}`);

const visibilityWord = ({ isPrivate }: { readonly isPrivate: boolean }): string =>
  isPrivate ? 'private' : 'public';

type Orphan = {
  readonly nameWithOwner: string;
  readonly url: string;
};

export const ConvertWorkspaceDialog = ({ open, workspace, onClose }: Props) => {
  const convertProjectToRepo = useAppStore((state) => state.convertProjectToRepo);
  const project = useAppStore(
    (state) => state.projects?.find((candidate) => candidate.workspaceId === workspace.id) ?? null,
  );
  const projectId = project?.id ?? null;
  const isGithubCliAvailable = useAppStore((s) => s.githubStatus?.available === true);
  const isGitlabConnected = useAppStore((s) =>
    (s.workspaceIntegrations[workspace.id] ?? []).some(
      (integration) => integration.provider === 'gitlab',
    ),
  );
  const githubOwner = useAppStore((s) => s.githubStatus?.user ?? null);

  const [action, setAction] = useState<Action>('create');
  const [host, setHost] = useState<Host>('github');
  const [reposState, setReposState] = useState<ReposState>({ kind: 'idle' });
  const [selectedRepo, setSelectedRepo] = useState(MANUAL_REPO);
  const [manualUrl, setManualUrl] = useState('');
  const [repoName, setRepoName] = useState('');
  const [visibility, setVisibility] = useState<GithubRepoVisibility | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphan, setOrphan] = useState<Orphan | null>(null);
  const [isConverted, setIsConverted] = useState(false);
  const keepDraftRef = useRef(false);

  const repos = reposState.kind === 'ok' ? reposState.repos : NO_REPOS;
  const areReposLoading = reposState.kind === 'loading';
  const isGithubConnected = isGithubCliAvailable && reposState.kind !== 'unauthenticated';
  const isConnected = host === 'github' ? isGithubConnected : isGitlabConnected;
  const nameCheck = useMemo(() => validateGithubRepoName({ name: repoName }), [repoName]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (keepDraftRef.current) {
      keepDraftRef.current = false;
      return;
    }
    setAction('create');
    setHost('github');
    setReposState({ kind: 'idle' });
    setSelectedRepo(MANUAL_REPO);
    setManualUrl('');
    setRepoName(lastPathSegment({ path: project?.rootPath ?? '' }));
    setVisibility(null);
    setIsBusy(false);
    setError(null);
    setOrphan(null);
    setIsConverted(false);
  }, [open, project?.rootPath ?? '']);

  useEffect(() => {
    if (!open || host !== 'github' || !isGithubCliAvailable) {
      return;
    }
    let cancelled = false;
    setReposState({ kind: 'loading' });
    listOwnedRepos(tauriGhRunner)
      .then((result) => {
        if (!cancelled) {
          setReposState(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReposState({ kind: 'failed', message: formatError(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, host, isGithubCliAvailable]);

  const picked =
    host === 'github' ? (repos.find((repo) => repo.nameWithOwner === selectedRepo) ?? null) : null;
  const remoteUrl = picked?.url ?? manualUrl.trim();

  const onHostChange = useCallback((next: Host) => {
    setHost(next);
    setReposState({ kind: 'idle' });
    setSelectedRepo(MANUAL_REPO);
    setManualUrl('');
    setError(null);
  }, []);

  const onActionChange = useCallback((next: Action) => {
    setAction(next);
    setHost('github');
    setError(null);
  }, []);

  const onConnect = useCallback(() => {
    keepDraftRef.current = true;
    onClose();
    openToolSettings({ tool: host });
  }, [host, onClose]);

  const onConvert = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      if (projectId === null) {
        throw new Error(`workspace has no projects: ${workspace.id}`);
      }
      await convertProjectToRepo({ projectId, remoteUrl });
      setIsConverted(true);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsBusy(false);
    }
  }, [convertProjectToRepo, projectId, remoteUrl, workspace.id]);

  const onCreate = useCallback(async () => {
    if (nameCheck.kind !== 'ok' || visibility === null) {
      return;
    }
    setIsBusy(true);
    setError(null);
    setOrphan(null);
    try {
      const result = await createGithubRepo({
        runner: tauriGhRunner,
        name: nameCheck.name,
        owner: githubOwner,
        visibility,
      });
      if (result.kind === 'invalid-name') {
        setError(result.reason);
        return;
      }
      if (result.kind === 'unauthenticated') {
        setError('GitHub turned the request down. Sign in with `gh auth login`, then try again.');
        return;
      }
      if (result.kind === 'failed') {
        setError(result.message);
        return;
      }
      if (result.kind === 'unverified') {
        setError(result.message);
        return;
      }
      if (result.kind === 'mismatch') {
        setError(
          `GitHub returned ${result.actual.nameWithOwner}, a ${visibilityWord({ isPrivate: result.actual.isPrivate })} repository, and you asked for ${result.expected.nameWithOwner} as ${visibilityWord({ isPrivate: result.expected.isPrivate })}. Nothing was linked and no remote was set. It exists on GitHub at ${result.actual.url} and was not removed.`,
        );
        return;
      }

      try {
        if (projectId === null) {
          throw new Error(`workspace has no projects: ${workspace.id}`);
        }
        await convertProjectToRepo({ projectId, remoteUrl: result.repo.url });
      } catch (err) {
        setOrphan({ nameWithOwner: result.repo.nameWithOwner, url: result.repo.url });
        setError(formatError(err));
        return;
      }
      setIsConverted(true);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsBusy(false);
    }
  }, [convertProjectToRepo, githubOwner, nameCheck, projectId, visibility, workspace.id]);

  const isCreating = action === 'create';
  const canCreate = isConnected && nameCheck.kind === 'ok' && visibility !== null;
  const primaryDisabled = isBusy || (isCreating ? !canCreate : !isConnected || remoteUrl === '');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={isConverted ? 'This is a dev project now' : 'Turn this into a dev project'}
      description={
        isConverted
          ? undefined
          : 'Give this project a git repository so sessions get their own branch and pull requests.'
      }
      footer={
        isConverted ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            {error != null && <span className="mr-auto text-xs text-danger">{error}</span>}
            <Button variant="ghost" onClick={onClose} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={() => void (isCreating ? onCreate() : onConvert())}
              disabled={primaryDisabled}
              aria-busy={isBusy}
              className={isBusy ? 'animate-border-pulse' : undefined}
            >
              {isCreating ? 'Create repository' : 'Convert to dev project'}
            </Button>
          </>
        )
      }
    >
      {isConverted ? (
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1.5 text-xs text-success">
            <Check size={ICON_SIZE.row} aria-hidden />
            {project?.name ?? workspace.name} is backed by git
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground">
            New sessions get their own branch and worktree. The sessions you already have keep
            working as plain folders, and nothing of yours was committed: add what you want tracked
            when you are ready.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orphan != null && (
            <p role="status" className="text-xs leading-relaxed text-warning">
              {orphan.nameWithOwner} was created on GitHub before this failed. It exists on GitHub
              at {orphan.url} and was not removed. Delete it yourself if you do not want it, or pick
              it from Link existing.
            </p>
          )}

          <SegmentedTabs
            ariaLabel="Repository setup"
            options={ACTION_OPTIONS}
            value={action}
            onChange={onActionChange}
            fill
          />

          {isCreating ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Goodboy creates the repository on GitHub. A GitLab project is linked from Link
              existing instead.
            </p>
          ) : (
            <SegmentedTabs
              ariaLabel="Repository host"
              options={[
                { value: 'github', label: 'GitHub' },
                { value: 'gitlab', label: 'GitLab' },
              ]}
              value={host}
              onChange={onHostChange}
              fill
            />
          )}

          {isConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <Check size={11} aria-hidden />
              {HOST_NAME[host]} is connected
            </span>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <StatusDot tone="warning" size="sm" />
                {reposState.kind === 'unauthenticated'
                  ? 'the GitHub CLI is installed but not signed in'
                  : `${HOST_NAME[host]} is not connected yet`}
              </span>
              <Button size="sm" variant="secondary" onClick={onConnect}>
                Connect {HOST_NAME[host]}
              </Button>
            </div>
          )}

          {isCreating && isConnected && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground">repository name</span>
                <Input
                  value={repoName}
                  placeholder={lastPathSegment({ path: project?.rootPath ?? '' })}
                  onChange={(event) => setRepoName(event.target.value)}
                  disabled={isBusy}
                  aria-label="Repository name"
                  aria-invalid={nameCheck.kind === 'invalid'}
                />
                {nameCheck.kind === 'invalid' && repoName.trim() !== '' && (
                  <span role="alert" className="text-xs text-danger">
                    {nameCheck.reason}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-foreground">visibility</span>
                <div role="radiogroup" aria-label="Visibility" className="flex gap-2">
                  {VISIBILITY_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      role="radio"
                      aria-checked={visibility === option.value}
                      variant={visibility === option.value ? 'primary' : 'secondary'}
                      onClick={() => setVisibility(option.value)}
                      disabled={isBusy}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                {visibility === null && (
                  <span className="text-xs text-muted-foreground">
                    Pick who can see the repository. Goodboy does not choose for you.
                  </span>
                )}
              </div>

              {nameCheck.kind === 'ok' && visibility !== null && (
                <p className="text-xs leading-relaxed text-foreground">
                  Create {repoDestination({ owner: githubOwner, name: nameCheck.name })} as a{' '}
                  {visibility} repository and set it as this folder&apos;s origin remote.
                </p>
              )}
            </>
          )}

          {!isCreating && host === 'github' && isConnected && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-foreground">repository</span>
              <Select
                block
                value={selectedRepo}
                onChange={(event) => setSelectedRepo(event.target.value)}
                disabled={isBusy || areReposLoading}
                aria-label="Repository"
              >
                <option value={MANUAL_REPO}>
                  {areReposLoading ? 'loading your repositories…' : 'paste a remote url instead'}
                </option>
                {repos.map((repo) => (
                  <option key={repo.nameWithOwner} value={repo.nameWithOwner}>
                    {repo.nameWithOwner}
                  </option>
                ))}
              </Select>
              {reposState.kind === 'ok' && repos.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  this account owns no repositories yet
                </span>
              )}
              {reposState.kind === 'failed' && (
                <span className="text-xs text-muted-foreground">
                  gh could not list your repositories: {reposState.message}
                </span>
              )}
            </div>
          )}

          {!isCreating && (host === 'gitlab' || selectedRepo === MANUAL_REPO) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-foreground">remote url</span>
              <Input
                value={manualUrl}
                placeholder={HOST_URL_PLACEHOLDER[host]}
                onChange={(event) => setManualUrl(event.target.value)}
                disabled={isBusy || !isConnected}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Create the repository on {HOST_NAME[host]} first, then paste its clone url here.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground">what happens</span>
            <ul className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <GitBranch size={11} aria-hidden className="shrink-0" />
                git starts tracking {project?.rootPath ?? ''}
              </li>
              <li>the first commit holds a .gitignore and nothing else</li>
              <li>your files stay untracked until you add them yourself</li>
              <li>your session folders and .goodboy stay out of version control</li>
              <li>
                {isCreating
                  ? 'the repository Goodboy creates becomes the origin remote'
                  : 'the repository you picked becomes the origin remote'}
              </li>
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
};
