import type { OverrideSettings } from '@goodboy/types';

type Params = {
  readonly attributionFooter: boolean | null;
};

export const overridesWithAttribution = ({ attributionFooter }: Params): OverrideSettings => ({
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: null,
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter,
});
