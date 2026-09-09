export type ResolveQueueErrorPlacement = 'none' | 'whole_surface' | 'inline';

export const resolveQueueErrorPlacement = ({
  error,
  hasLoadedComments,
}: {
  readonly error: string | null;
  readonly hasLoadedComments: boolean;
}): ResolveQueueErrorPlacement => {
  if (error === null) {
    return 'none';
  }
  return hasLoadedComments ? 'inline' : 'whole_surface';
};
