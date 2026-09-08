type Params = {
  readonly branch: string;
};

export type BranchLabelParts = Readonly<{
  head: string;
  tail: string;
}>;

const SEPARATORS = ['-', '/', '_', '.'];

const MAX_TAIL = 14;

export const splitBranchLabel = ({ branch }: Params): BranchLabelParts => {
  const cut = SEPARATORS.reduce((best, separator) => {
    const index = branch.lastIndexOf(separator);
    return index > best ? index : best;
  }, -1);
  if (cut <= 0 || branch.length - cut > MAX_TAIL) {
    return { head: branch, tail: '' };
  }
  return { head: branch.slice(0, cut), tail: branch.slice(cut) };
};
