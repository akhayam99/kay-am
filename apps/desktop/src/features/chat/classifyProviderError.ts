import { parseUsageLimitResetAt } from './parseUsageLimitResetAt';

type ModelUnavailableAction = 'enable_max_mode' | 'choose_supported_model';

type ModelUnavailablePattern = {
  readonly pattern: RegExp;
  readonly action: ModelUnavailableAction;
};

export type ProviderErrorClassification =
  | { readonly kind: 'authentication' }
  | {
      readonly kind: 'model_not_available';
      readonly model: string;
      readonly action: ModelUnavailableAction;
    }
  | { readonly kind: 'rate_limit' }
  | { readonly kind: 'usage_limit'; readonly resetAtMs?: number }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'other' };

type Params = {
  readonly message: string;
};

const AUTH_ERROR_PATTERNS = [
  /not authenticated/i,
  /not logged in/i,
  /auth required/i,
  /authentication required/i,
  /please log in/i,
  /please sign in/i,
  /unauthenticated/i,
  /\b401\b/,
  /unauthorized/i,
  /login required/i,
  /not signed in/i,
];

const MODEL_NOT_AVAILABLE_PATTERNS = [
  {
    pattern: /The model "([^"]+)" requires Max Mode to be enabled/i,
    action: 'enable_max_mode',
  },
  {
    pattern: /The '([^']+)' model is not supported when using Codex with a ChatGPT account/i,
    action: 'choose_supported_model',
  },
] satisfies ReadonlyArray<ModelUnavailablePattern>;

const USAGE_LIMIT_PATTERNS = [/usage limit/i];

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /quota exceeded/i,
  /exceeded your quota/i,
  /token limit/i,
  /limit reached/i,
  /too many requests/i,
  /\b429\b/,
];

const UNREACHABLE_PATTERNS = [
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /ETIMEDOUT/,
  /EAI_AGAIN/,
  /getaddrinfo/i,
  /socket hang up/i,
  /network error/i,
  /connection refused/i,
  /bad gateway/i,
  /service unavailable/i,
  /gateway timeout/i,
  /timed out/i,
  /\b50[234]\b/,
];

export const classifyProviderError = ({ message }: Params): ProviderErrorClassification => {
  if (AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: 'authentication' };
  }

  for (const entry of MODEL_NOT_AVAILABLE_PATTERNS) {
    const match = entry.pattern.exec(message);
    const model = match?.[1];
    if (model != null && model !== '') {
      return {
        kind: 'model_not_available',
        model,
        action: entry.action,
      };
    }
  }

  if (USAGE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))) {
    const resetAtMs = parseUsageLimitResetAt({ message });
    return {
      kind: 'usage_limit',
      ...(resetAtMs !== null && { resetAtMs }),
    };
  }

  if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: 'rate_limit' };
  }

  if (UNREACHABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: 'unreachable' };
  }

  return { kind: 'other' };
};
