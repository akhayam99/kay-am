import { addReviewThreadReply } from '@goodboy/core';
import type { SessionId } from '@goodboy/types';
import { tauriGhRunner } from '../../../features/github/github';
import { threadOutcome } from '../resolve/threadOutcome';
import { buildResolutionReplyBody } from './buildResolutionReplyBody';
import { resolverReplyForThread } from './resolverReplyForThread';
import { sessionThreadGhOptions } from './sessionThreadGhOptions';
import type { GetFn } from './types';

type Closure = { commitSha?: string; reason?: string; reply?: string };

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly closure?: Closure;
};

const firstFilled = ({
  candidates,
}: {
  readonly candidates: ReadonlyArray<string | null | undefined>;
}): string | null => {
  for (const candidate of candidates) {
    const text = candidate?.trim() ?? '';
    if (text !== '') {
      return text;
    }
  }
  return null;
};

export const postThreadReply = async ({
  get,
  sessionId,
  threadId,
  closure,
}: Params): Promise<boolean> => {
  const receipt = get().sessionResolveThreads[sessionId]?.find((row) => row.threadId === threadId);
  if (receipt?.replyPostedAt !== null && receipt?.replyPostedAt !== undefined) {
    return false;
  }
  const savedOutcome = receipt === undefined ? null : threadOutcome({ row: receipt });
  const pendingReply = get().sessionPendingResolutions[sessionId]?.find(
    (resolution) => resolution.threadId === threadId,
  )?.reply;
  const reply = firstFilled({
    candidates: [
      closure?.reply,
      savedOutcome?.reply ?? (receipt?.disposition === null ? receipt.replyDraft : undefined),
      pendingReply,
      resolverReplyForThread(get().resolverThreadOutcomes, threadId),
    ],
  });
  const pr = get().sessionGithub[sessionId]?.pr ?? null;
  const replyBody = buildResolutionReplyBody(
    reply === null ? closure : { ...closure, reply },
    pr?.url ?? null,
  );
  if (replyBody === null) {
    return false;
  }
  const posted = await addReviewThreadReply(
    tauriGhRunner,
    threadId,
    replyBody,
    sessionThreadGhOptions({ get, sessionId }),
  );
  await get().updateResolveThread({
    sessionId,
    threadId,
    prNumber: pr?.number,
    patch: {
      replyPostedAt: Date.now(),
      replyId: posted.id,
    },
  });
  return true;
};
