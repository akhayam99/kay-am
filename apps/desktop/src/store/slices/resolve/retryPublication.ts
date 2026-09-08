import {
  listResolvePublicationThreads,
  listResolvePublicationsForSession,
  listResolveThreads,
} from '@goodboy/db';
import type { PrComment, ResolvePublicationPreview, ResolveThread } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { preparePublication } from './preparePublication';
import type { SessionParams, SliceParams } from './types';

type Params = SliceParams & SessionParams;

const PUBLICATION_FAILED = 'publication_failed:';

const isUncertain = ({ row }: { readonly row: ResolveThread }): boolean =>
  row.stateReason?.includes('uncertain') === true;

type ReplyParams = {
  readonly comments: ReadonlyArray<PrComment>;
  readonly threadId: string;
  readonly body: string;
};

const matchingReplies = ({ comments, threadId, body }: ReplyParams): number =>
  comments.filter((comment) => comment.threadId === threadId && comment.body === body).length;

export const retryPublication = async ({
  set,
  get,
  sessionId,
}: Params): Promise<ResolvePublicationPreview> => {
  await get()
    .refreshSessionPrDetail(sessionId, { force: true })
    .catch(() => undefined);
  const rows = await listResolveThreads({ db: tauriDatabase, sessionId });
  const failedRows = rows.filter((row) => row.stateReason?.startsWith(PUBLICATION_FAILED) === true);
  const comments = get().sessionGithub[sessionId]?.detail?.comments ?? [];
  const publications = await listResolvePublicationsForSession({ db: tauriDatabase, sessionId });
  const frozen = (
    await Promise.all(
      publications.map((publication) =>
        listResolvePublicationThreads({ db: tauriDatabase, publicationId: publication.id }),
      ),
    )
  ).flat();
  const retryable: Array<string> = [];
  for (const row of failedRows) {
    const comment = comments.find((item) => item.threadId === row.threadId);
    if (comment?.resolved === true) {
      await get().updateResolveThread({
        sessionId,
        threadId: row.threadId,
        patch: {
          state: 'closed',
          githubResolved: true,
          closedAt: Date.now(),
          closedSource: 'github',
          stateReason: null,
        },
      });
      continue;
    }
    if (!isUncertain({ row })) {
      retryable.push(row.threadId);
      continue;
    }
    const body = frozen.find(
      (thread) => thread.threadId === row.threadId && thread.replyBody !== null,
    )?.replyBody;
    const seen =
      body === undefined || body === null
        ? 0
        : matchingReplies({ comments, threadId: row.threadId, body });
    if (seen > 1) {
      await get().updateResolveThread({
        sessionId,
        threadId: row.threadId,
        patch: {
          stateReason: `${PUBLICATION_FAILED}${JSON.stringify({ error: 'ambiguous reply on the thread', reason: 'review_on_github' })}`,
        },
      });
      continue;
    }
    if (seen === 1 && row.replyPostedAt === null) {
      await get().updateResolveThread({
        sessionId,
        threadId: row.threadId,
        patch: { replyPostedAt: Date.now() },
      });
    }
    retryable.push(row.threadId);
  }
  return preparePublication({ set, get, sessionId, threadIds: retryable });
};
