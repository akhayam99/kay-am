import type { ModelSelection, ProviderId } from '@goodboy/types';
import { modelIdForSelection } from './modelIdForSelection';

type Params = {
  readonly provider: ProviderId;
  readonly selection: ModelSelection;
};

export const resolvedStoredModelId = ({ provider, selection }: Params): string => {
  if (selection.variant == null && selection.toggles == null) {
    return selection.key;
  }
  return modelIdForSelection({ provider, selection });
};
