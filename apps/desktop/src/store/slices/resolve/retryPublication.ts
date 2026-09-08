import {
  listResolvePublicationThreads,
  listResolvePublicationsForSession,
  listResolveThreads,
  upsertResolvePublicationThread,
} from '@goodboy/db';
import type {
  PrComment,
  ResolvePublicationPreview,
  ResolvePublicationThread,
  ResolveThread,
} from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { preparePublication } from './preparePublication';
import { reconcileReplyOperation } from './reconcileReplyOperation';
import type { SessionParams, SliceParams } from './types';

type Params = SliceParams & SessionParams;

const PUBLICATION_FAILED = 'publication_failed:';
export const AMBIGUOUS_REPLY = 'a reply may already be on this conversation';

const isUncertain = ({ row }: { readonly row: ResolveThread }): boolean =>
  row.stateReason?.includes('uncertain') === true;

export const retryPublication = async ({
  set,
  get,
  sessionId,
}: Params): Promise<ResolvePublicationPreview> => {
  await get()
    .refreshSessionPrDetail(sessionId, { force: true })
    .catch(() => undefined);
  const github = get().sessionGithub[sessionId] ?? null;
  const comments: ReadonlyArray<PrComment> = github?.detail?.comments ?? [];
  const fetchedAt = github?.detailFetchedAt ?? null;
  const observedAt = fetchedAt === null ? null : new Date(fetchedAt).getTime();
  const isObservationTrusted = github?.detailError == null && github?.detail != null;
  const rows = await listResolveThreads({ db: tauriDatabase, sessionId });
  const failedRows = rows.filter((row) => row.stateReason?.startsWith(PUBLICATION_FAILED) === true);
  const publications = await listResolvePublicationsForSession({ db: tauriDatabase, sessionId });
  const frozen = (
    await Promise.all(
      publications.map((publication) =>
        listResolvePublicationThreads({ db: tauriDatabase, publicationId: publication.id }),
      ),
    )
  ).flat();
  const latestFrozen = ({
    threadId,
  }: {
    readonly threadId: string;
  }): ResolvePublicationThread | null =>
    frozen.filter((thread) => thread.threadId === threadId).at(-1) ?? null;
  const considered: Array<string> = [];
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
      considered.push(row.threadId);
      continue;
    }
    const thread = latestFrozen({ threadId: row.threadId });
    if (thread === null) {
      considered.push(row.threadId);
      continue;
    }
    const verdict = reconcileReplyOperation({
      thread,
      comments,
      observedAt,
      isObservationTrusted,
    });
    if (verdict === 'ambiguous') {
      await upsertResolvePublicationThread({
        db: tauriDatabase,
        thread: { ...thread, error: AMBIGUOUS_REPLY },
      });
      const isWithdrawn = await get().updateResolveThread({
        sessionId,
        threadId: row.threadId,
        patch: {
          stateReason: `${PUBLICATION_FAILED}${JSON.stringify({ error: AMBIGUOUS_REPLY, reason: 'review_on_github' })}`,
        },
      });
      if (isWithdrawn) {
        considered.push(row.threadId);
      }
      continue;
    }
    if (verdict === 'posted') {
      const postedAt = Date.now();
      await upsertResolvePublicationThread({
        db: tauriDatabase,
        thread: { ...thread, replyPhase: 'posted', replyPostedAt: postedAt, error: null },
      });
      if (row.replyPostedAt === null) {
        await get().updateResolveThread({
          sessionId,
          threadId: row.threadId,
          patch: { replyPostedAt: postedAt },
        });
      }
    }
    considered.push(row.threadId);
  }
  return preparePublication({ set, get, sessionId, threadIds: considered });
};
