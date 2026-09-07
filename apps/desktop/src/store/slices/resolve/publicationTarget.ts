import type { SessionId } from '@goodboy/types';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import type { GetFn } from './types';

export type PublicationTarget = Readonly<{
  repo: string;
  prNumber: number;
  prUrl: string | null;
}>;

type Params = { readonly get: GetFn; readonly sessionId: SessionId };

const REPO_FROM_URL = /^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/\d+/;

export const publicationTarget = ({ get, sessionId }: Params): PublicationTarget => {
  const pr = get().sessionGithub[sessionId]?.pr ?? null;
  const slug = pr === null ? null : (REPO_FROM_URL.exec(pr.url ?? '')?.[1] ?? null);
  const repoRoot = getSessionRepo({ get, sessionId })?.repoRoot ?? null;
  return {
    repo: slug ?? repoRoot ?? sessionId,
    prNumber: pr?.number ?? 0,
    prUrl: pr?.url ?? null,
  };
};
