type Params = { readonly stateReason: string | null };

export const resolveOutcomeReason = ({ stateReason }: Params): string | null => {
  if (stateReason?.startsWith('publication_failed:') !== true) {
    return stateReason;
  }
  try {
    const parsed: unknown = JSON.parse(stateReason.slice('publication_failed:'.length));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'reason' in parsed &&
      typeof parsed.reason === 'string'
    ) {
      return resolveOutcomeReason({ stateReason: parsed.reason });
    }
  } catch {
    return null;
  }
  return null;
};
