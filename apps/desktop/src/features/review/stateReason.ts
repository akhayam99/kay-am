const FAILURE_PREFIXES = ['dirty_tree', 'missing_result', 'stopped', 'failed'] as const;

export type ResolveFailurePrefix = (typeof FAILURE_PREFIXES)[number];

export type DecodedStateReason = {
  readonly prefix: ResolveFailurePrefix | null;
  readonly isCandidate: boolean;
  readonly publicationError: string | null;
  readonly reason: string | null;
};

const EMPTY: DecodedStateReason = {
  prefix: null,
  isCandidate: false,
  publicationError: null,
  reason: null,
};

const parsePublicationFailure = ({
  payload,
}: {
  readonly payload: string;
}): { readonly error: string; readonly reason: string | null } => {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== 'object' || parsed === null) {
      return { error: payload, reason: null };
    }
    const error =
      'error' in parsed && typeof parsed.error === 'string' ? parsed.error : 'unknown error';
    const reason = 'reason' in parsed && typeof parsed.reason === 'string' ? parsed.reason : null;
    return { error, reason };
  } catch {
    return { error: payload, reason: null };
  }
};

const stripPrefixes = ({
  value,
}: {
  readonly value: string;
}): { readonly prefix: ResolveFailurePrefix | null; readonly rest: string } => {
  let rest = value;
  let prefix: ResolveFailurePrefix | null = null;
  for (;;) {
    const match = FAILURE_PREFIXES.find((candidate) => rest.startsWith(`${candidate}:`));
    if (match === undefined) {
      return { prefix, rest };
    }
    prefix = prefix ?? match;
    rest = rest.slice(match.length + 1);
  }
};

export const decodeStateReason = ({
  stateReason,
}: {
  readonly stateReason: string | null;
}): DecodedStateReason => {
  if (stateReason === null || stateReason === '') {
    return EMPTY;
  }
  if (stateReason.startsWith('publication_failed:')) {
    const { error, reason } = parsePublicationFailure({
      payload: stateReason.slice('publication_failed:'.length),
    });
    const inner = decodeStateReason({ stateReason: reason });
    return { ...inner, publicationError: error };
  }
  const { prefix, rest } = stripPrefixes({ value: stateReason });
  if (rest.startsWith('candidate:')) {
    const tail = rest.slice('candidate:'.length);
    return { prefix, isCandidate: true, publicationError: null, reason: tail === '' ? null : tail };
  }
  return { prefix, isCandidate: false, publicationError: null, reason: rest === '' ? null : rest };
};
