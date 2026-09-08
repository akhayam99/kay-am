import { slugifyDir } from './slugifyDir';
import { UNTITLED_BASE } from './untitledTitle';

const MAX_SLUG_LENGTH = 48;
const IDENTIFIER_MAX_LENGTH = 16;

type Params = {
  readonly prefix: string;
  readonly sessionId: string;
  readonly goal: string;
  readonly explicitSlug?: string;
  readonly taskIdentifiers?: ReadonlyArray<string>;
  readonly existingBranches?: ReadonlyArray<string>;
};

const trimAtWord = ({
  value,
  maxLength,
}: {
  readonly value: string;
  readonly maxLength: number;
}) => {
  if (value.length <= maxLength) {
    return value;
  }
  const sliced = value.slice(0, maxLength + 1);
  const boundary = sliced.lastIndexOf('-');
  if (boundary > 0) {
    return sliced.slice(0, boundary);
  }
  return value.slice(0, maxLength).replace(/-+$/g, '');
};

const withSuffix = ({
  base,
  suffix,
}: {
  readonly base: string;
  readonly suffix: string;
}): string => {
  const maxBaseLength = MAX_SLUG_LENGTH - suffix.length - 1;
  return `${trimAtWord({ value: base, maxLength: maxBaseLength })}-${suffix}`;
};

const taskSlug = ({ identifier, goal }: { readonly identifier: string; readonly goal: string }) => {
  const normalizedIdentifier = trimAtWord({
    value: slugifyDir(identifier).slice(0, IDENTIFIER_MAX_LENGTH).replace(/-+$/g, ''),
    maxLength: IDENTIFIER_MAX_LENGTH,
  });
  const bracketlessGoal = goal.replace(/\[[^\]]*\]/g, ' ');
  const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const identifierlessGoal = bracketlessGoal.replace(new RegExp(escapedIdentifier, 'gi'), ' ');
  const remainder = slugifyDir(identifierlessGoal);
  return trimAtWord({
    value: `${normalizedIdentifier}-${remainder}`,
    maxLength: MAX_SLUG_LENGTH,
  });
};

export const deriveBranchName = ({
  prefix,
  sessionId,
  goal,
  explicitSlug,
  taskIdentifiers = [],
  existingBranches = [],
}: Params): string => {
  if (explicitSlug !== undefined) {
    return explicitSlug;
  }
  const id8 = sessionId.slice(0, 8);
  const identifier = taskIdentifiers.find((candidate) => candidate.trim() !== '')?.trim();
  if (identifier !== undefined) {
    const candidate = taskSlug({ identifier, goal });
    const branch = `${prefix}/${candidate}`;
    if (!existingBranches.includes(branch)) {
      return candidate;
    }
    return withSuffix({ base: candidate, suffix: id8 });
  }
  const trimmedGoal = goal.trim();
  if (trimmedGoal === '' || trimmedGoal === UNTITLED_BASE) {
    return `session-${id8}`;
  }
  return withSuffix({ base: slugifyDir(trimmedGoal), suffix: id8 });
};

type NextSlugParams = {
  readonly base: string;
  readonly prefix: string;
  readonly taken: ReadonlyArray<string>;
};

export const nextAvailableSlug = ({ base, prefix, taken }: NextSlugParams): string => {
  const used = new Set(taken);
  if (!used.has(`${prefix}/${base}`)) {
    return base;
  }
  for (let ordinal = 2; ordinal <= 99; ordinal += 1) {
    const candidate = withSuffix({ base, suffix: String(ordinal) });
    if (!used.has(`${prefix}/${candidate}`)) {
      return candidate;
    }
  }
  return withSuffix({ base, suffix: crypto.randomUUID().slice(0, 8) });
};
