import type {
  AgentEffort,
  ProviderId,
  RoleModelFallback,
  RoleModelPreferences,
} from '@goodboy/types';
import { devWarn } from '../dev-log';
import { PROVIDER_CAPABILITIES } from './capabilities';
import { defaultsForRole, isAgentRole } from '../roles';
import { resolveModelArgs } from './resolveModelArgs';
import { resolvedStoredModelId } from './resolvedStoredModelId';
import { resolveStoredModelSelection } from './resolveStoredModelSelection';

export type ResolvedRoleFallback = Readonly<{
  provider: ProviderId;
  model: string;
  effort: AgentEffort;
}>;

export type ResolvedRoleRouting = Readonly<{
  provider: ProviderId;
  model: string;
  effort: AgentEffort;
  isOverride: boolean;
  fallback?: ResolvedRoleFallback;
}>;

type Params = {
  readonly role: string;
  readonly prefs: RoleModelPreferences | null | undefined;
};

type FallbackParams = {
  readonly fallback: RoleModelFallback | undefined;
  readonly effort: AgentEffort;
};

const resolveRoleFallback = ({ fallback, effort }: FallbackParams): ResolvedRoleFallback | null => {
  if (fallback == null) {
    return null;
  }
  const capabilities = PROVIDER_CAPABILITIES[fallback.providerId];
  if (capabilities == null) {
    return null;
  }
  const requested = fallback.effort ?? effort;
  const stored = resolveStoredModelSelection({
    provider: fallback.providerId,
    id: fallback.model,
    effort: requested,
  });
  if (stored.report?.kind === 'unknown') {
    return null;
  }
  const resolved = resolveModelArgs({
    provider: fallback.providerId,
    selection: stored.selection,
  });
  return {
    provider: fallback.providerId,
    model: resolvedStoredModelId({
      provider: fallback.providerId,
      selection: stored.selection,
    }),
    effort: resolved.clamped?.applied ?? requested,
  };
};

export const resolveRoleRouting = ({ role, prefs }: Params): ResolvedRoleRouting => {
  const defaults = defaultsForRole(role);
  const compiled: ResolvedRoleRouting = {
    provider: defaults.provider,
    model: defaults.model,
    effort: defaults.effort,
    isOverride: false,
  };
  const preference = prefs?.[isAgentRole(role) ? role : 'custom'];
  if (preference == null) {
    return compiled;
  }
  const capabilities = PROVIDER_CAPABILITIES[preference.providerId];
  if (capabilities == null) {
    devWarn(
      `[role-models] invalid ${role} provider ${preference.providerId}; using the ${compiled.provider} default model`,
    );
    return compiled;
  }
  const stored = resolveStoredModelSelection({
    provider: preference.providerId,
    id: preference.model,
    effort: preference.effort,
  });
  if (stored.report?.kind === 'unknown') {
    devWarn(
      `[role-models] invalid ${role} model ${preference.model} for ${preference.providerId}; using the ${compiled.provider} default model`,
    );
    return compiled;
  }
  const resolved = resolveModelArgs({
    provider: preference.providerId,
    selection: stored.selection,
  });
  const effort = resolved.clamped?.applied ?? preference.effort;
  const fallback = resolveRoleFallback({ fallback: preference.fallback, effort });
  return {
    provider: preference.providerId,
    model: resolvedStoredModelId({
      provider: preference.providerId,
      selection: stored.selection,
    }),
    effort,
    isOverride: true,
    ...(fallback != null && { fallback }),
  };
};
