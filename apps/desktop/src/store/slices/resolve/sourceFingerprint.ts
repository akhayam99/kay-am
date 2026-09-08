import type { PrComment } from '@goodboy/types';

type Params = {
  readonly comments: ReadonlyArray<PrComment>;
  readonly threadId: string;
};

const digest = async ({ text }: { readonly text: string }): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
};

export const sourceFingerprint = async ({ comments, threadId }: Params): Promise<string | null> => {
  const onThread = comments.filter((comment) => comment.threadId === threadId);
  if (onThread.length === 0) {
    return null;
  }
  return digest({
    text: onThread.map((comment) => `${comment.id}${comment.body}`).join(''),
  });
};
