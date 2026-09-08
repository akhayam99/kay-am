import type { Project, Session } from '@goodboy/types';
import { resolveSettings } from '@goodboy/core';
import { DEFAULT_BRANCH_PREFIX } from '../../../features/settings/settings';
import { deriveBranchName } from '../sessions/deriveBranchName';
import type { GetFn } from './types';

type NamingParams = {
  readonly get: GetFn;
  readonly session: Session;
  readonly project: Project;
};

export const resolveMountBranchPrefix = ({ get, session, project }: NamingParams): string => {
  const resolved = resolveSettings({
    global: {
      defaultProviderId: session.providerPreference.defaultProvider,
      defaultWorkflowId: null,
      defaultBranchPrefix: DEFAULT_BRANCH_PREFIX,
      parallelEnabled: false,
      defaultVerbosity: 'normal',
    },
    workspaceOverride: get().workspaceOverrides[session.workspaceId] ?? null,
    projectOverride: project.overrides,
  });
  return resolved.defaultBranchPrefix;
};

type SlugParams = {
  readonly get: GetFn;
  readonly session: Session;
  readonly prefix: string;
};

export const resolveSessionSlug = ({ get, session, prefix }: SlugParams): string => {
  const branches = (get().sessionProjectMounts[session.id] ?? []).map((mount) => mount.branch);
  const namespaced = branches.find((branch) => branch.includes('/'));
  if (namespaced !== undefined) {
    return namespaced.slice(namespaced.indexOf('/') + 1);
  }
  const identifiers = (get().sessionExternalTasks[session.id] ?? []).map((task) => task.identifier);
  return deriveBranchName({
    prefix,
    sessionId: session.id,
    goal: session.goal,
    taskIdentifiers: identifiers,
    existingBranches: branches,
  });
};

type SplitBranch = {
  readonly branchPrefix: string;
  readonly branchSlug: string;
};

export const splitBranchName = ({ branch }: { readonly branch: string }): SplitBranch => {
  const separator = branch.indexOf('/');
  if (separator <= 0) {
    return { branchPrefix: '', branchSlug: branch };
  }
  return {
    branchPrefix: branch.slice(0, separator),
    branchSlug: branch.slice(separator + 1),
  };
};
