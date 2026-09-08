import { addReviewThreadReply } from '@goodboy/core';
import { upsertResolvePublicationThread } from '@goodboy/db';
import type { ResolvePublicationThread, SessionId } from '@goodboy/types';
import { tauriGhRunner } from '../../../features/github/github';
import { tauriDatabase } from '../../../shared/lib/db';
import { sessionThreadGhOptions } from './sessionThreadGhOptions';
import type { GetFn } from './types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly replyBody: string | null;
  readonly frozen: ResolvePublicationThread;
};

export type PostedReply = { readonly posted: boolean; readonly replyId: string | null };

export const postThreadReply = async ({
  get,
  sessionId,
  threadId,
  replyBody,
  frozen,
}: Params): Promise<PostedReply> => {
  const receipt = get().sessionResolveThreads[sessionId]?.find((row) => row.threadId === threadId);
  if (receipt?.replyPostedAt != null || frozen.replyPhase === 'posted') {
    return { posted: false, replyId: frozen.replyId };
  }
  if (replyBody === null) {
    return { posted: false, replyId: null };
  }
  await upsertResolvePublicationThread({
    db: tauriDatabase,
    thread: { ...frozen, replyPhase: 'sending' },
  });
  const pr = get().sessionGithub[sessionId]?.pr ?? null;
  const posted = await addReviewThreadReply(
    tauriGhRunner,
    threadId,
    replyBody,
    sessionThreadGhOptions({ get, sessionId }),
  );
  const postedAt = Date.now();
  await get().updateResolveThread({
    sessionId,
    threadId,
    prNumber: pr?.number,
    patch: { replyPostedAt: postedAt, replyId: posted.id },
  });
  await upsertResolvePublicationThread({
    db: tauriDatabase,
    thread: { ...frozen, replyPhase: 'posted', replyId: posted.id, replyPostedAt: postedAt },
  });
  return { posted: true, replyId: posted.id };
};
