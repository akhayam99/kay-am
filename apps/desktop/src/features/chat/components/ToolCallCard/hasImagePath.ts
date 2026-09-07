import { isImagePath } from './isImagePath';

type Params = {
  readonly data: unknown;
};

const MAX_NODES = 10_000;

export const hasImagePath = ({ data }: Params): boolean => {
  const pending: unknown[] = [data];
  const seen = new WeakSet<object>();
  let nodeCount = 1;
  while (pending.length > 0) {
    const value = pending.pop();
    if (isImagePath({ value })) {
      return true;
    }
    if (value != null && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      for (const key in value) {
        if (nodeCount >= MAX_NODES) {
          break;
        }
        if (!Object.hasOwn(value, key)) {
          continue;
        }
        pending.push((value as Record<string, unknown>)[key]);
        nodeCount += 1;
      }
    }
  }
  return false;
};
