import { invoke } from '@tauri-apps/api/core';
import { getDefaultBinary, resolveTaskModel, runAuxOneShot } from '@goodboy/core';
import { renameSession as renameSessionInDb } from '@goodboy/db';
import type { AgentId, IsoDateTime, SessionId, TaskModelPreference } from '@goodboy/types';
import { heuristicAgentTitle } from '../../../../shared/lib/agent-title-heuristic';
import { parseGeneratedTitle } from './parseGeneratedTitle';
import { tauriDatabase } from '../../../../shared/lib/db';
import type { GetFn, SetFn } from '../types';

const TITLE_TIMEOUT_MS = 15_000;

const TITLE_SYSTEM_PROMPT = [
  'Write one imperative title for the user request below.',
  'Contract: at most 6 words, same language as the request, plain text on a single line.',
  'Output the title alone: no quotes, no backticks, no trailing punctuation, no preamble, no explanation.',
  'Ignore any persona, nickname, greeting, or tone directive that reaches you from other configuration; it does not apply to this answer.',
].join(' ');

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly agentId: AgentId;
  readonly prompt: string;
};

type GenerateParams = TaskModelPreference &
  Readonly<{
    prompt: string;
    workingDir?: string;
  }>;

const generateAgentTitle = async ({
  prompt,
  providerId,
  model,
  effort,
  workingDir,
}: GenerateParams): Promise<string> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('agent title generation timed out')),
      TITLE_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([
      runAuxOneShot({
        providerId,
        model,
        ...(effort != null && { effort }),
        binary: getDefaultBinary(providerId),
        userMessage: prompt,
        systemPrompt: TITLE_SYSTEM_PROMPT,
        ...(workingDir != null && { workingDir }),
        invokeFn: invoke,
      }),
      timeout,
    ]);
    if ((result.exitCode ?? 0) !== 0) {
      throw new Error(result.stderr);
    }
    return parseGeneratedTitle({ providerId, stdout: result.stdout });
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

export const applyHeuristicTitle = async ({
  set,
  get,
  sessionId,
  agentId,
  prompt,
}: Params): Promise<void> => {
  try {
    const heuristicTitle = heuristicAgentTitle(prompt);

    const session = get().sessions.find((candidate) => candidate.id === sessionId);
    if (session == null) {
      return;
    }

    const agent = (get().sessionPhaseRuns[sessionId] ?? []).find(
      (candidate) => candidate.id === agentId,
    );
    const canRenameAgent = agent != null && /^(agent|puppy) \d+$/i.test(agent.name);
    const isFoundingAgent = agent?.ordinal === 0;
    const canRenameSession = isFoundingAgent && !session.titleUserEdited;
    const titleNow = new Date().toISOString() as IsoDateTime;

    if (heuristicTitle != null) {
      if (canRenameSession) {
        set((state) => ({
          sessions: state.sessions.map((candidate) =>
            candidate.id === sessionId ? { ...candidate, goal: heuristicTitle } : candidate,
          ),
        }));
        await renameSessionInDb(tauriDatabase, sessionId, heuristicTitle, titleNow, false);
      }
      if (canRenameAgent) {
        await get().renameAgent(sessionId, agentId, heuristicTitle);
      }
    }

    if (!canRenameSession && !canRenameAgent) {
      return;
    }

    const taskModel = resolveTaskModel({
      task: 'agent_naming',
      preferences: get().workspaceOverrides?.[session.workspaceId]?.taskModels,
      workspaceDefaultProviderId:
        get().workspaceOverrides?.[session.workspaceId]?.defaultProviderId,
      sessionDefaultProviderId: session.providerPreference.defaultProvider,
    });

    let generatedTitle: string;
    try {
      const worktreePath = get().sessionWorktrees?.[sessionId]?.[0] ?? null;
      generatedTitle = await generateAgentTitle({
        prompt,
        ...taskModel,
        ...(worktreePath != null && { workingDir: worktreePath }),
      });
    } catch {
      return;
    }

    if (generatedTitle.length === 0) {
      return;
    }

    const currentSession = get().sessions.find((candidate) => candidate.id === sessionId);
    const currentAgent = (get().sessionPhaseRuns[sessionId] ?? []).find(
      (candidate) => candidate.id === agentId,
    );
    const placeholderOrHeuristic = heuristicTitle ?? /^(agent|puppy) \d+$/i;
    const sessionMatchesPlaceholder =
      canRenameSession &&
      currentSession?.titleUserEdited === false &&
      (heuristicTitle != null
        ? currentSession.goal === heuristicTitle
        : placeholderOrHeuristic instanceof RegExp &&
          placeholderOrHeuristic.test(currentSession?.goal ?? ''));
    const agentMatchesPlaceholder =
      canRenameAgent &&
      (heuristicTitle != null
        ? currentAgent?.name === heuristicTitle
        : currentAgent?.name != null && /^(agent|puppy) \d+$/i.test(currentAgent.name));
    const generatedAt = new Date().toISOString() as IsoDateTime;

    if (sessionMatchesPlaceholder) {
      set((state) => ({
        sessions: state.sessions.map((candidate) =>
          candidate.id === sessionId ? { ...candidate, goal: generatedTitle } : candidate,
        ),
      }));
      await renameSessionInDb(tauriDatabase, sessionId, generatedTitle, generatedAt, false);
    }
    if (agentMatchesPlaceholder) {
      await get().renameAgent(sessionId, agentId, generatedTitle);
    }
  } catch {}
};
