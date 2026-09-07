import type { ContextSlot, SessionId } from '@goodboy/types';
import { resolveTaskModel, rewriteWorkflowGoal } from '@goodboy/core';
import { upsertContextSlot } from '@goodboy/db';
import { invoke } from '@tauri-apps/api/core';
import { tauriDatabase } from '../../../shared/lib/db';
import { routeTaskModel } from '../../../features/providers/taskModelRouting';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import type { GetFn, SetFn } from './types';

export const reprocessGoalForWorkflow = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId): Promise<void> => {
    try {
      const state = get();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!session) {
        return;
      }

      const slots = state.sessionSlots[sessionId] ?? [];
      const goalSlot = slots.find((s) => s.key === 'goal');
      const goal = goalSlot?.value.trim() ?? '';
      if (goal.length === 0) {
        return;
      }

      const templates = state.phaseTemplates[session.workspaceId] ?? [];
      const stepNames = session.workflowRuns
        .filter((r) => !r.discardedAt)
        .flatMap((r) => {
          const template = templates.find((t) => t.id === r.workflowId);
          if (!template) {
            return [];
          }
          return [...template.steps].sort((a, b) => a.ordinal - b.ordinal).map((s) => s.name);
        });
      if (stepNames.length === 0) {
        return;
      }

      const worktreePath = getSessionRepo({ get, sessionId })?.worktreePath ?? null;
      const taskModel = routeTaskModel({
        taskModel: resolveTaskModel(
          'prose_polish',
          state.workspaceOverrides?.[session.workspaceId]?.taskModels,
          session.providerPreference.defaultProvider,
        ),
        connectedProviders: state.providers
          .filter((provider) => provider.connection === 'connected')
          .map((provider) => provider.id),
        enabledProviders: session.providerPreference.enabledProviders ?? null,
        cooldowns: state.providerCooldowns,
        nowMs: Date.now(),
      });
      if (taskModel == null) {
        return;
      }
      const rewritten = await rewriteWorkflowGoal(
        {
          ...taskModel,
          invokeFn: invoke,
          ...(worktreePath != null && { workingDir: worktreePath }),
        },
        { goal, stepNames },
      );
      const cleaned = rewritten?.trim() ?? '';
      if (cleaned.length === 0 || cleaned === goal) {
        return;
      }

      const next: ContextSlot = { key: 'goal', value: cleaned, enabled: goalSlot?.enabled ?? true };
      await upsertContextSlot(tauriDatabase, sessionId, next, 'summarizer');

      set((s) => {
        const existing = s.sessionSlots[sessionId] ?? [];
        const hasGoal = existing.some((x) => x.key === 'goal');
        return {
          sessionSlots: {
            ...s.sessionSlots,
            [sessionId]: hasGoal
              ? existing.map((x) => (x.key === 'goal' ? next : x))
              : [...existing, next],
          },
        };
      });
    } catch (e) {
      console.error('reprocessGoalForWorkflow failed', e);
    }
  };
};
