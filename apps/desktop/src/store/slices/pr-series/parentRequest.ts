import type { MountPullRequestIdentity, MountPullRequestProvider } from '@goodboy/types';

type Params = {
  readonly provider?: string | null;
  readonly host?: string | null;
  readonly repo?: string | null;
  readonly number?: number | null;
};

const filled = (value: string | null | undefined): string => (value ?? '').trim();

const isParentProvider = (value: string): value is MountPullRequestProvider =>
  value === 'github' || value === 'gitlab' || value === 'bitbucket';

export const resolveParentRequest = ({
  provider,
  host,
  repo,
  number,
}: Params): MountPullRequestIdentity | null => {
  const providerName = filled(provider);
  const hostName = filled(host);
  const repoSlug = filled(repo);
  const hasNumber = typeof number === 'number' && Number.isInteger(number) && number > 0;
  const supplied = [providerName, hostName, repoSlug].filter((part) => part !== '').length;
  if (supplied === 0 && !hasNumber) {
    return null;
  }
  if (supplied < 3 || !hasNumber) {
    throw new Error(
      'A parent request needs all of --parent-provider, --parent-host, --parent-repo and a positive --parent-number.',
    );
  }
  if (!isParentProvider(providerName)) {
    throw new Error(`Unknown parent provider: ${providerName}. Use github, gitlab or bitbucket.`);
  }
  return {
    provider: providerName,
    host: hostName,
    repoSlug,
    prNumber: number ?? 0,
  };
};
