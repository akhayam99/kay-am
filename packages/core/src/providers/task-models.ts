import type {
  AuxTaskId,
  ProviderId,
  TaskModelPreference,
  TaskModelPreferences,
} from '@goodboy/types';
import { devWarn } from '../dev-log';
import { PROVIDER_CAPABILITIES, getDefaultTurnModel } from './capabilities';
import { getCheapModel, getMidModel } from './cli-defaults';
import { resolvedStoredModelId } from './resolvedStoredModelId';
import { resolveStoredModelSelection } from './resolveStoredModelSelection';

type AutomaticParams = {
  readonly task: AuxTaskId;
  readonly providerId: ProviderId;
};

type PreferredParams = {
  readonly task: AuxTaskId;
  readonly preference: TaskModelPreference;
  readonly defaultProviderId: ProviderId;
};

type Params = {
  readonly task: AuxTaskId;
  readonly preferences: TaskModelPreferences | null | undefined;
  readonly workspaceDefaultProviderId: ProviderId | null | undefined;
  readonly sessionDefaultProviderId: ProviderId;
};

const automaticModelForTask = ({ task, providerId }: AutomaticParams): string => {
  if (task === 'rebase') {
    return providerId === 'anthropic' ? 'sonnet-5' : getDefaultTurnModel({ id: providerId });
  }
  if (task === 'workflow_orchestrator') {
    return getMidModel(providerId);
  }
  return getCheapModel(providerId);
};

const preferredTaskModel = ({
  task,
  preference,
  defaultProviderId,
}: PreferredParams): TaskModelPreference | null => {
  if (PROVIDER_CAPABILITIES[preference.providerId] == null) {
    devWarn(
      `[task-models] invalid ${task} provider ${preference.providerId}; using the ${defaultProviderId} automatic model`,
    );
    return null;
  }
  const stored = resolveStoredModelSelection({
    provider: preference.providerId,
    id: preference.model,
  });
  if (stored.report?.kind === 'unknown') {
    devWarn(
      `[task-models] invalid ${task} model ${preference.model} for ${preference.providerId}; using the ${defaultProviderId} automatic model`,
    );
    return null;
  }
  return {
    providerId: preference.providerId,
    model: resolvedStoredModelId({
      provider: preference.providerId,
      selection: stored.selection,
    }),
    ...(preference.effort != null && { effort: preference.effort }),
  };
};

export const resolveTaskModel = ({
  task,
  preferences,
  workspaceDefaultProviderId,
  sessionDefaultProviderId,
}: Params): TaskModelPreference => {
  const defaultProviderId = workspaceDefaultProviderId ?? sessionDefaultProviderId;
  const preference = preferences?.[task];
  const preferred =
    preference == null ? null : preferredTaskModel({ task, preference, defaultProviderId });
  if (preferred != null) {
    return preferred;
  }
  return {
    providerId: defaultProviderId,
    model: automaticModelForTask({ task, providerId: defaultProviderId }),
  };
};
