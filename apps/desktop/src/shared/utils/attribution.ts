import type { OverrideSettings } from '@goodboy/types';

export const ATTRIBUTION_FOOTER = 'Written by Goodboy';

type IsAttributionEnabledParams = {
  readonly overrides: OverrideSettings | null | undefined;
};

export const isAttributionEnabled = ({ overrides }: IsAttributionEnabledParams): boolean =>
  overrides?.attributionFooter !== false;

type AppendAttributionParams = {
  readonly body: string;
  readonly isEnabled: boolean;
};

export const appendAttribution = ({ body, isEnabled }: AppendAttributionParams): string => {
  if (isEnabled === false) {
    return body;
  }
  const trimmed = body.replace(/\s+$/, '');
  if (trimmed === '') {
    return ATTRIBUTION_FOOTER;
  }
  if (trimmed === ATTRIBUTION_FOOTER || trimmed.endsWith(`\n${ATTRIBUTION_FOOTER}`)) {
    return trimmed;
  }
  return `${trimmed}\n\n${ATTRIBUTION_FOOTER}`;
};
