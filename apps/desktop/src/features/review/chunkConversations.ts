import type { CommentThread } from '../github/comment-threads';

export const MAX_THREADS_PER_ATTEMPT = 12;

const CHARS_PER_TOKEN = 4;
const THREAD_OVERHEAD_CHARS = 320;
const KICKOFF_OVERHEAD_CHARS = 3200;

type MeasureParams = { readonly threads: ReadonlyArray<CommentThread> };

type Params = {
  readonly threads: ReadonlyArray<CommentThread>;
  readonly contextWindow?: number | null;
  readonly maxPerAttempt?: number;
  readonly measurePrompt?: (params: MeasureParams) => number;
};

const defaultMeasure = ({ threads }: MeasureParams): number =>
  threads.reduce(
    (total, thread) =>
      total +
      THREAD_OVERHEAD_CHARS +
      thread.head.body.length +
      thread.replies.reduce((sum, reply) => sum + reply.body.length, 0),
    KICKOFF_OVERHEAD_CHARS,
  );

const groupByPath = ({
  threads,
}: {
  readonly threads: ReadonlyArray<CommentThread>;
}): ReadonlyArray<ReadonlyArray<CommentThread>> => {
  const byPath = new Map<string, Array<CommentThread>>();
  const order: Array<string> = [];
  for (const thread of threads) {
    const key = thread.head.path ?? '';
    const bucket = byPath.get(key);
    if (bucket === undefined) {
      byPath.set(key, [thread]);
      order.push(key);
      continue;
    }
    bucket.push(thread);
  }
  return order.map((key) => byPath.get(key) ?? []);
};

export const chunkConversations = ({
  threads,
  contextWindow = null,
  maxPerAttempt = MAX_THREADS_PER_ATTEMPT,
  measurePrompt = defaultMeasure,
}: Params): ReadonlyArray<ReadonlyArray<CommentThread>> => {
  if (threads.length === 0) {
    return [];
  }
  const budget = contextWindow === null ? null : contextWindow / 2;
  const fits = ({ candidate }: { readonly candidate: ReadonlyArray<CommentThread> }): boolean => {
    if (candidate.length > maxPerAttempt) {
      return false;
    }
    if (budget === null) {
      return true;
    }
    return measurePrompt({ threads: candidate }) / CHARS_PER_TOKEN <= budget;
  };
  const chunks: Array<ReadonlyArray<CommentThread>> = [];
  let current: Array<CommentThread> = [];
  const close = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = [];
    }
  };
  for (const group of groupByPath({ threads })) {
    if (fits({ candidate: [...current, ...group] })) {
      current = [...current, ...group];
      continue;
    }
    close();
    if (fits({ candidate: group })) {
      current = [...group];
      continue;
    }
    for (const thread of group) {
      if (current.length > 0 && !fits({ candidate: [...current, thread] })) {
        close();
      }
      current.push(thread);
    }
  }
  close();
  return chunks;
};
