import type { SessionId } from '@goodboy/types';
import type { GetFn } from './types';

export type PublicationTarget = Readonly<{
  repo: string | null;
  prNumber: number;
  prUrl: string | null;
}>;

type Params = { readonly get: GetFn; readonly sessionId: SessionId };

const REPO_FROM_URL = /^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/\d+/;

export const publicationTarget = ({ get, sessionId }: Params): PublicationTarget => {
  const pr = get().sessionGithub[sessionId]?.pr ?? null;
  const slug = pr === null ? null : (REPO_FROM_URL.exec(pr.url ?? '')?.[1] ?? null);
  return {
    repo: slug,
    prNumber: pr?.number ?? 0,
    prUrl: pr?.url ?? null,
  };
};
