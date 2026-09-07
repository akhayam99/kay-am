import type { Workflow } from '@goodboy/types';

export const isImportableWorkflow = (workflow: Workflow): boolean => {
  return (
    workflow.deletedAt == null &&
    workflow.isPreset !== false &&
    (workflow.origin == null || workflow.origin === 'custom')
  );
};
