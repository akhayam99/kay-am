import { planTaskModelFallback } from '@goodboy/core';
import type { ProviderId, TaskModelPreference } from '@goodboy/types';
import type { ProviderErrorClassification } from '../chat/classifyProviderError';
import type { ProviderCooldowns } from './routing';

export const USAGE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
export const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
export const AUTHENTICATION_COOLDOWN_MS = 5 * 60 * 1000;

type CoolingDownParams = {
  readonly cooldowns: ProviderCooldowns;
  readonly nowMs: number;
};

type CooldownUpdateParams = {
  readonly cooldowns: ProviderCooldowns;
  readonly provider: ProviderId;
  readonly cooldownUntilMs: number | null;
};

type FailureCooldownParams = {
  readonly cooldowns: ProviderCooldowns;
  readonly provider: ProviderId;
  readonly failure: ProviderErrorClassification;
  readonly nowMs: number;
};

type CooldownUntilParams = {
  readonly failure: ProviderErrorClassification;
  readonly nowMs: number;
};

type RouteParams = {
  readonly taskModel: TaskModelPreference;
  readonly connectedProviders: ReadonlyArray<ProviderId>;
  readonly enabledProviders: ReadonlyArray<ProviderId> | null;
  readonly cooldowns: ProviderCooldowns;
  readonly nowMs: number;
};

const activeCooldowns = ({
  cooldowns,
  nowMs,
}: CoolingDownParams): ReadonlyArray<readonly [ProviderId, number]> => {
  return Object.entries(cooldowns).flatMap(([provider, until]) =>
    until !== undefined && until > nowMs ? [[provider as ProviderId, until] as const] : [],
  );
};

export const providersCoolingDown = ({
  cooldowns,
  nowMs,
}: CoolingDownParams): ReadonlyArray<ProviderId> => {
  return activeCooldowns({ cooldowns, nowMs }).map(([provider]) => provider);
};

export const cooldownWindowEnd = ({ cooldowns, nowMs }: CoolingDownParams): number | null => {
  const untils = activeCooldowns({ cooldowns, nowMs }).map(([, until]) => until);
  return untils.length === 0 ? null : Math.max(...untils);
};

export const withProviderCooldown = ({
  cooldowns,
  provider,
  cooldownUntilMs,
}: CooldownUpdateParams): ProviderCooldowns => {
  const next = cooldownUntilMs ?? Date.now() + USAGE_LIMIT_COOLDOWN_MS;
  const current = cooldowns[provider] ?? 0;
  return { ...cooldowns, [provider]: Math.max(current, next) };
};

const cooldownUntilFor = ({ failure, nowMs }: CooldownUntilParams): number | null => {
  if (failure.kind === 'usage_limit') {
    return failure.resetAtMs ?? nowMs + USAGE_LIMIT_COOLDOWN_MS;
  }
  if (failure.kind === 'rate_limit') {
    return nowMs + RATE_LIMIT_COOLDOWN_MS;
  }
  if (failure.kind === 'authentication') {
    return nowMs + AUTHENTICATION_COOLDOWN_MS;
  }
  return null;
};

export const withFailureCooldown = ({
  cooldowns,
  provider,
  failure,
  nowMs,
}: FailureCooldownParams): ProviderCooldowns => {
  const until = cooldownUntilFor({ failure, nowMs });
  if (until == null) {
    return cooldowns;
  }
  return withProviderCooldown({ cooldowns, provider, cooldownUntilMs: until });
};

export const routeTaskModel = ({
  taskModel,
  connectedProviders,
  enabledProviders,
  cooldowns,
  nowMs,
}: RouteParams): TaskModelPreference | null => {
  const coolingDown = providersCoolingDown({ cooldowns, nowMs });
  if (!coolingDown.includes(taskModel.providerId)) {
    return taskModel;
  }
  return planTaskModelFallback({
    failure: 'usage_limit',
    taskModel,
    attempt: 0,
    connectedProviders,
    enabledProviders,
    coolingDownProviders: coolingDown,
  });
};
