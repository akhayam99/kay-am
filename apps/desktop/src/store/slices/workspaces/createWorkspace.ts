import type { IsoDateTime, OverrideSettings, Workspace, WorkspaceId } from '@goodboy/types';
import { seedWorkflowLibrary } from '@goodboy/core';
import { insertWorkspace } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { invokeWorkflowList } from '../../../features/workflows/workflows';
import { invokeSkillRescan } from '../../../features/skills/skills';
import { workspaceSlug } from './slug';
import type { GetFn, SetFn } from './types';

type Input = {
  readonly name: string;
};

const EMPTY_OVERRIDES: OverrideSettings = {
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
  attributionFooter: null,
};

export const createWorkspace = (set: SetFn, get: GetFn) => {
  return async ({ name }: Input): Promise<Workspace> => {
    const trimmed = name.trim();
    if (trimmed === '') {
      throw new Error('workspace name is required');
    }
    const now = new Date().toISOString() as IsoDateTime;
    const workspaceId = crypto.randomUUID() as WorkspaceId;
    const workspace: Workspace = {
      id: workspaceId,
      name: trimmed,
      slug: workspaceSlug({ name: trimmed, id: workspaceId }),
      sessionsRoot: null,
      overrides: EMPTY_OVERRIDES,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };
    await insertWorkspace({ db: tauriDatabase, workspace });
    set((state) => ({ workspaces: [workspace, ...state.workspaces] }));

    await seedWorkflowLibrary({ db: tauriDatabase }, workspace.id).catch(() => undefined);
    const templates = await invokeWorkflowList(workspace.id).catch(() => []);
    set((state) => ({ phaseTemplates: { ...state.phaseTemplates, [workspace.id]: templates } }));
    const skills = await invokeSkillRescan(workspace.id).catch(() => []);
    set((state) => ({ skills: { ...state.skills, [workspace.id]: skills } }));

    return workspace;
  };
};
