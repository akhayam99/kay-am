import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  PROVIDER_CAPABILITIES,
  getDefaultTurnModel,
  isSlotKey,
  runsForWorkflowRun,
  type SlotKey,
} from '@goodboy/core';
import type {
  AgentId,
  AgentSourceKind,
  AttachmentInput,
  ProviderId,
  SessionId,
  TurnProviderOverride,
} from '@goodboy/types';
import { useAppStore } from '../../store/store';
import { resolveSessionRepo } from '../../store/slices/worktrees/resolveSessionRepo';
import { WorkflowGateError } from '../../store/slices/workflows/workflowActivationGate';
import { PROVIDER_LABEL_LOWER } from '../providers/providers';
import { isMainWindow } from '../workspace/window';
import { worktreeDiffFile } from '../worktree/worktree';
import {
  evaluateMobileCreateSession,
  evaluateMobileMerge,
  evaluateMobileSpawnWorkflow,
  isMergeMethod,
  markSessionMobileShared,
} from './mobileConfinement';
import type { AgentKind } from '../session/agent-kind';
import type {
  JiraIntegrationConfig,
  SessionExternalTaskProvider,
  WorkspaceId,
  IntegrationBindingProvider,
  WorkspaceIntegrationProvider,
} from '@goodboy/types';
import { linearFetchAssignedIssues, type LinearIssue } from '../integrations/linear/client';
import { goalFromIssue as linearGoalFromIssue } from '../integrations/linear/goal-from-issue';
import {
  sentryFetchIssues,
  sentryFetchIssueDetail,
  type SentryIssue,
} from '../integrations/sentry/client';
import { goalFromSentry } from '../integrations/sentry/goal-from-sentry';
import {
  gitlabFetchAssignedIssues,
  issueIdentifier as gitlabIssueIdentifier,
  type GitlabIssue,
} from '../integrations/gitlab/client';
import { goalFromIssue as gitlabGoalFromIssue } from '../integrations/gitlab/goal-from-issue';
import { jiraListIssues, jiraGetIssue, type JiraIssue } from '../integrations/jira/client';
import { goalFromIssue as jiraGoalFromIssue } from '../integrations/jira/goal-from-issue';

export const BRIDGE_PROVIDER_ALLOWLIST = [
  'anthropic',
  'cursor',
  'codex',
  'gemini',
  'opencode',
  'openrouter',
  'moonshot',
] satisfies ReadonlyArray<ProviderId>;

export const PROVIDER_MENU_ORDER = [
  'anthropic',
  'cursor',
  'codex',
  'gemini',
  'opencode',
  'openrouter',
  'moonshot',
] satisfies ReadonlyArray<ProviderId>;

type Expect<T extends true> = T;
type BridgeProviderAllowlistIsTotal =
  Exclude<ProviderId, (typeof BRIDGE_PROVIDER_ALLOWLIST)[number]> extends never ? true : false;
type _BridgeProviderAllowlistTotalCheck = Expect<BridgeProviderAllowlistIsTotal>;
type ProviderMenuOrderIsTotal =
  Exclude<ProviderId, (typeof PROVIDER_MENU_ORDER)[number]> extends never ? true : false;
type _ProviderMenuOrderTotalCheck = Expect<ProviderMenuOrderIsTotal>;

const MOBILE_EDITABLE_SLOTS: ReadonlySet<SlotKey> = new Set<SlotKey>([
  'goal',
  'decisions',
  'open_questions',
  'last_output_summary',
]);

const COMMAND_EVENT = 'bridge://command';

type Origin = 'desktop' | 'mobile';
export type BridgeCommand = {
  readonly id: string;
  readonly kind: string;
  readonly origin: Origin;
  readonly data: unknown;
};

const MOBILE_AGENT_KINDS: ReadonlySet<string> = new Set([
  'planner',
  'implementer',
  'reviewer',
  'tester',
  'debugger',
  'scout',
  'resolver',
]);

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

class BridgeSafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgeSafeError';
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function requireSession(data: Record<string, unknown>): SessionId {
  const id = asString(data.sessionId);
  if (!id) {
    throw new BridgeSafeError('missing sessionId');
  }
  const known = useAppStore.getState().sessions.some((s) => s.id === id);
  if (!known) {
    throw new BridgeSafeError(`unknown session: ${id}`);
  }
  return id as SessionId;
}

function coerceAttachments(v: unknown): ReadonlyArray<AttachmentInput> {
  if (!Array.isArray(v)) {
    return [];
  }
  const out: AttachmentInput[] = [];
  for (const item of v) {
    const r = asRecord(item);
    const id = asString(r.id);
    const fileName = asString(r.fileName);
    const mimeType = asString(r.mimeType);
    const dataBase64 = asString(r.dataBase64);
    if (id && fileName && mimeType && dataBase64) {
      out.push({ id, fileName, mimeType, dataBase64 });
    }
  }
  return out;
}

function coerceOverride(data: Record<string, unknown>): TurnProviderOverride | undefined {
  const providerId = asString(data.providerId);
  if (!providerId || !BRIDGE_PROVIDER_ALLOWLIST.includes(providerId as ProviderId)) {
    return undefined;
  }
  const model = asString(data.model);
  return { providerId: providerId as ProviderId, ...(model ? { model } : {}) };
}

function buildProviderMenu(): {
  providers: ReadonlyArray<{
    id: ProviderId;
    label: string;
    connection: string;
    defaultModel: string;
    models: ReadonlyArray<{ id: string; label: string; tier: string }>;
  }>;
} {
  const known = useAppStore.getState().providers;
  const providers = PROVIDER_MENU_ORDER.map((id) => {
    const info = known.find((p) => p.id === id);
    return {
      id,
      label: info?.label ?? PROVIDER_LABEL_LOWER[id],
      connection: info?.connection ?? 'missing',
      defaultModel: getDefaultTurnModel({ id }),
      models: PROVIDER_CAPABILITIES[id].models.map((m) => ({
        id: m.id,
        label: m.label,
        tier: m.tier,
      })),
    };
  });
  return { providers };
}

type NormalizedIssue = {
  readonly provider: WorkspaceIntegrationProvider;
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
  readonly state: string | null;
  readonly description: string | null;
};

const ALL_ISSUE_PROVIDERS: ReadonlyArray<WorkspaceIntegrationProvider> = [
  'linear',
  'sentry',
  'gitlab',
  'jira',
];

const normalizeLinear = (i: LinearIssue): NormalizedIssue => ({
  provider: 'linear',
  identifier: i.identifier,
  title: i.title,
  url: i.url,
  state: i.state?.name ?? null,
  description: i.description ?? null,
});

const normalizeSentry = (i: SentryIssue): NormalizedIssue => ({
  provider: 'sentry',
  identifier: i.shortId ?? i.id,
  title: i.title,
  url: i.permalink ?? '',
  state: i.status ?? null,
  description: i.culprit ?? null,
});

const normalizeGitlab = (i: GitlabIssue): NormalizedIssue => ({
  provider: 'gitlab',
  identifier: gitlabIssueIdentifier(i),
  title: i.title,
  url: i.webUrl,
  state: i.state ?? null,
  description: i.description ?? null,
});

const normalizeJira = (i: JiraIssue): NormalizedIssue => ({
  provider: 'jira',
  identifier: i.key,
  title: i.summary,
  url: i.url,
  state: i.status ?? null,
  description: i.description,
});

function gitlabHostFor(workspaceId: WorkspaceId): string | undefined {
  const rows = useAppStore.getState().workspaceIntegrations[workspaceId] ?? [];
  const row = rows.find((r) => r.provider === 'gitlab');
  return row && row.provider === 'gitlab' ? row.config.host : undefined;
}

function jiraConfigFor(workspaceId: WorkspaceId): JiraIntegrationConfig | undefined {
  const rows = useAppStore.getState().workspaceIntegrations[workspaceId] ?? [];
  const row = rows.find((r) => r.provider === 'jira');
  return row && row.provider === 'jira' ? row.config : undefined;
}

function connectedProviders(workspaceId: WorkspaceId): ReadonlySet<IntegrationBindingProvider> {
  const rows = useAppStore.getState().workspaceIntegrations[workspaceId] ?? [];
  return new Set(rows.map((r) => r.provider));
}

async function fetchIssuesFor(
  workspaceId: WorkspaceId,
  provider: WorkspaceIntegrationProvider,
): Promise<NormalizedIssue[]> {
  try {
    switch (provider) {
      case 'linear':
        return (await linearFetchAssignedIssues(workspaceId)).map(normalizeLinear);
      case 'sentry': {
        const page = await sentryFetchIssues(workspaceId);
        return page.issues.map(normalizeSentry);
      }
      case 'gitlab': {
        const host = gitlabHostFor(workspaceId);
        if (!host) {
          return [];
        }
        return (await gitlabFetchAssignedIssues(workspaceId, host)).map(normalizeGitlab);
      }
      case 'jira': {
        const config = jiraConfigFor(workspaceId);
        if (config == null) {
          return [];
        }
        const issues = await jiraListIssues({
          workspaceId,
          siteUrl: config.siteUrl,
          email: config.email,
          projectKey: config.projectKey,
          assignedOnly: true,
        });
        return issues.map(normalizeJira);
      }
      case 'bitbucket':
      case 'slack':
        return [];
      default: {
        const unexpected: never = provider;
        throw new BridgeSafeError(`unsupported issue provider: ${String(unexpected)}`);
      }
    }
  } catch (e) {
    console.error(`[bridge] queryIssues ${provider} fetch failed`, e);
    return [];
  }
}

async function queryIssuesForMobile(filter?: WorkspaceIntegrationProvider): Promise<{
  issues: ReadonlyArray<NormalizedIssue>;
}> {
  const store = useAppStore.getState();
  const wanted = filter ? [filter] : ALL_ISSUE_PROVIDERS;
  const jobs: Array<Promise<NormalizedIssue[]>> = [];
  for (const ws of store.workspaces) {
    const connected = connectedProviders(ws.id);
    for (const provider of wanted) {
      if (connected.has(provider)) {
        jobs.push(fetchIssuesFor(ws.id, provider));
      }
    }
  }
  const settled = await Promise.all(jobs);
  return { issues: settled.flat() };
}

async function resolveIssueForSession(
  workspaceId: WorkspaceId,
  provider: WorkspaceIntegrationProvider,
  identifier: string,
): Promise<{
  goal: string;
  externalTask: {
    provider: SessionExternalTaskProvider;
    externalId: string;
    identifier: string;
    url: string;
    title: string;
  };
}> {
  switch (provider) {
    case 'linear': {
      const issue = (await linearFetchAssignedIssues(workspaceId)).find(
        (i) => i.identifier === identifier,
      );
      if (!issue) {
        throw new BridgeSafeError(`linear issue not found: ${identifier}`);
      }
      return {
        goal: linearGoalFromIssue(issue),
        externalTask: {
          provider: 'linear',
          externalId: issue.id,
          identifier: issue.identifier,
          url: issue.url,
          title: issue.title,
        },
      };
    }
    case 'sentry': {
      const page = await sentryFetchIssues(workspaceId);
      const issue = page.issues.find((i) => (i.shortId ?? i.id) === identifier);
      if (!issue) {
        throw new BridgeSafeError(`sentry issue not found: ${identifier}`);
      }
      const detail = await sentryFetchIssueDetail(workspaceId, issue.id).catch(() => null);
      return {
        goal: goalFromSentry(issue, detail),
        externalTask: {
          provider: 'sentry',
          externalId: issue.id,
          identifier: issue.shortId ?? issue.id,
          url: issue.permalink ?? '',
          title: issue.title,
        },
      };
    }
    case 'gitlab': {
      const host = gitlabHostFor(workspaceId);
      if (!host) {
        throw new BridgeSafeError('gitlab host not configured for this workspace');
      }
      const issue = (await gitlabFetchAssignedIssues(workspaceId, host)).find(
        (i) => gitlabIssueIdentifier(i) === identifier,
      );
      if (!issue) {
        throw new BridgeSafeError(`gitlab issue not found: ${identifier}`);
      }
      return {
        goal: gitlabGoalFromIssue(issue),
        externalTask: {
          provider: 'gitlab',
          externalId: String(issue.id),
          identifier: gitlabIssueIdentifier(issue),
          url: issue.webUrl,
          title: issue.title,
        },
      };
    }
    case 'jira': {
      const config = jiraConfigFor(workspaceId);
      if (config == null) {
        throw new BridgeSafeError('jira is not configured for this workspace');
      }
      const issue = await jiraGetIssue({
        workspaceId,
        siteUrl: config.siteUrl,
        email: config.email,
        issueKey: identifier,
      });
      return {
        goal: jiraGoalFromIssue({ issue }),
        externalTask: {
          provider: 'jira',
          externalId: issue.id,
          identifier: issue.key,
          url: issue.url,
          title: issue.summary,
        },
      };
    }
    case 'bitbucket':
      throw new BridgeSafeError(`bitbucket does not expose issues to Goodboy: ${identifier}`);
    case 'slack':
      throw new BridgeSafeError(`slack threads cannot start a session from mobile: ${identifier}`);
    default: {
      const unexpected: never = provider;
      throw new BridgeSafeError(`unsupported issue provider: ${String(unexpected)}`);
    }
  }
}

async function resolveIssueForSessionSafe(
  workspaceId: WorkspaceId,
  provider: WorkspaceIntegrationProvider,
  identifier: string,
): Promise<Awaited<ReturnType<typeof resolveIssueForSession>>> {
  try {
    return await resolveIssueForSession(workspaceId, provider, identifier);
  } catch (e) {
    if (e instanceof BridgeSafeError) {
      throw e;
    }
    console.error(
      `[bridge] resolveIssueForSession failed (provider=${provider}, identifier=${identifier})`,
      e,
    );
    throw new BridgeSafeError(`could not resolve issue ${identifier}`);
  }
}

async function advanceNextWorkflowStep(sessionId: SessionId): Promise<void> {
  const store = useAppStore.getState();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session || session.workflowRuns.length === 0) {
    throw new BridgeSafeError('session has no workflow to advance');
  }
  const templates = store.phaseTemplates[session.workspaceId] ?? [];
  const runs = store.sessionPhaseRuns[sessionId] ?? [];
  for (const run of session.workflowRuns) {
    if (run.discardedAt) {
      continue;
    }
    const template = templates.find((t) => t.id === run.workflowId);
    if (!template) {
      continue;
    }
    const runAgents = runsForWorkflowRun(runs, run.id);
    const sortedSteps = [...template.steps].sort((a, b) => a.ordinal - b.ordinal);
    for (const step of sortedSteps) {
      const agent = runAgents.find((r) => r.stepId === step.id);
      if (!agent || agent.status !== 'pending') {
        continue;
      }
      const allPrevDone = sortedSteps
        .filter((s) => s.ordinal < step.ordinal)
        .every((s) =>
          runAgents.some(
            (r) => r.stepId === s.id && (r.status === 'completed' || r.status === 'skipped'),
          ),
        );
      if (allPrevDone) {
        try {
          await store.activateWorkflowAgent({ sessionId, agentId: agent.id, focus: 'none' });
        } catch (e) {
          if (e instanceof WorkflowGateError) {
            throw new BridgeSafeError(e.message);
          }
          throw e;
        }
        return;
      }
      break;
    }
  }
  throw new BridgeSafeError('no workflow step is ready to advance');
}

async function dispatchMobile(cmd: BridgeCommand): Promise<unknown> {
  const store = useAppStore.getState();
  const data = asRecord(cmd.data);

  switch (cmd.kind) {
    case 'queryProviders':
      return buildProviderMenu();

    case 'queryIssues': {
      const rawProvider = asString(data.provider);
      if (rawProvider === undefined) {
        return queryIssuesForMobile(undefined);
      }
      if (!ALL_ISSUE_PROVIDERS.includes(rawProvider as WorkspaceIntegrationProvider)) {
        throw new BridgeSafeError(`unsupported provider: ${rawProvider}`);
      }
      return queryIssuesForMobile(rawProvider as WorkspaceIntegrationProvider);
    }

    case 'queryFileDiff': {
      const sessionId = requireSession(data);
      const path = asString(data.path);
      if (!path) {
        throw new BridgeSafeError('queryFileDiff requires a path');
      }
      const worktreePath = resolveSessionRepo({ state: store, sessionId })?.worktreePath ?? null;
      if (!worktreePath) {
        throw new BridgeSafeError('session worktree is not available');
      }
      const diff = await worktreeDiffFile({ worktreePath, path });
      return { diff };
    }

    case 'createSessionFromIssue': {
      const workspaceId = asString(data.workspaceId);
      const provider = asString(data.provider);
      const identifier = asString(data.issueIdentifier);
      const setupWorkflow = data.setupWorkflow === true;
      if (!identifier) {
        throw new BridgeSafeError('createSessionFromIssue requires an issueIdentifier');
      }
      const gate = evaluateMobileCreateSession({
        workspaceId,
        provider,
        projectId: data.projectId,
        workspaces: store.workspaces,
        projects: workspaceId
          ? store.projects.filter((project) => project.workspaceId === workspaceId)
          : [],
        integrations: workspaceId
          ? (store.workspaceIntegrations[workspaceId as WorkspaceId] ?? [])
          : [],
      });
      if (!gate.ok) {
        throw new BridgeSafeError(`create session refused: ${gate.reason}`);
      }
      let session;
      try {
        const resolved = await resolveIssueForSessionSafe(
          gate.workspaceId,
          gate.provider,
          identifier,
        );
        ({ session } = await store.createSession({
          workspaceId: gate.workspaceId,
          projectId: gate.projectId,
          goal: resolved.goal,
          externalTasks: [resolved.externalTask],
          mobileShared: true,
        }));
      } catch (e) {
        gate.reservation.release();
        throw e;
      }
      gate.reservation.commit();
      markSessionMobileShared(session.id);
      if (setupWorkflow) {
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('goodboy:open-workflow-builder', {
                detail: { sessionId: session.id },
              }),
            );
          }
        } catch {}
      }
      return { sessionId: session.id };
    }

    case 'advanceStep': {
      const sessionId = requireSession(data);
      markSessionMobileShared(sessionId);
      await advanceNextWorkflowStep(sessionId);
      return undefined;
    }

    case 'send': {
      const sessionId = requireSession(data);
      const content = asString(data.content) ?? '';
      const attachments = coerceAttachments(data.attachments);
      if (content.trim().length === 0 && attachments.length === 0) {
        throw new BridgeSafeError('send requires content or attachments');
      }
      markSessionMobileShared(sessionId);
      const agentId = asString(data.agentId) as AgentId | undefined;
      const override = coerceOverride(data);
      void store
        .sendTurn({
          sessionId,
          ...(agentId ? { agentId } : {}),
          content,
          origin: 'operator',
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(override ? { override } : {}),
        })
        .catch((e) => console.error('[bridge] mobile send failed', e));
      return undefined;
    }

    case 'spawnAgent': {
      const sessionId = requireSession(data);
      markSessionMobileShared(sessionId);
      const name = asString(data.name);
      const prompt = asString(data.prompt);
      const rawKind = asString(data.kind);
      const kind = rawKind && MOBILE_AGENT_KINDS.has(rawKind) ? (rawKind as AgentKind) : undefined;
      const override = coerceOverride(data);
      await store.spawnAgent(sessionId, {
        ...(name ? { name } : {}),
        ...(prompt ? { initialPrompt: prompt } : {}),
        ...(kind ? { kindOverride: kind } : {}),
        ...(override ? { provider: override.providerId } : {}),
        ...(override?.model ? { model: override.model } : {}),
        focus: 'agent',
      });
      return undefined;
    }

    case 'setContextSlot': {
      const sessionId = requireSession(data);
      const rawKey = asString(data.key);
      if (!rawKey || !isSlotKey(rawKey) || !MOBILE_EDITABLE_SLOTS.has(rawKey)) {
        throw new BridgeSafeError(`slot not editable from mobile: ${rawKey ?? '(missing)'}`);
      }
      const value = typeof data.value === 'string' ? data.value : undefined;
      if (value === undefined) {
        throw new BridgeSafeError('setContextSlot requires a string value');
      }
      markSessionMobileShared(sessionId);
      await store.upsertSessionSlot(sessionId, rawKey, value);
      return undefined;
    }

    case 'resolveComment': {
      const sessionId = requireSession(data);
      const prompt = asString(data.prompt);
      if (!prompt) {
        throw new BridgeSafeError('resolveComment requires a prompt describing the comment');
      }
      markSessionMobileShared(sessionId);
      const sourceCommentUrl = asString(data.commentUrl);
      const sourceThreadId = asString(data.threadId);
      const sourceKind: AgentSourceKind | null = sourceThreadId
        ? 'review_comment'
        : sourceCommentUrl
          ? 'issue_comment'
          : null;
      await store.spawnAgent(sessionId, {
        kindOverride: 'resolver',
        initialPrompt: prompt,
        ...(sourceCommentUrl ? { sourceCommentUrl } : {}),
        ...(sourceThreadId ? { sourceThreadId } : {}),
        ...(sourceKind !== null && { sourceKind }),
        focus: 'agent',
      });
      return undefined;
    }

    case 'mergePr': {
      const sessionId = requireSession(data);
      const method = asString(data.method) ?? 'squash';
      const pr = store.sessionGithub[sessionId]?.pr ?? null;
      const gate = evaluateMobileMerge(pr, method);
      if (!gate.ok) {
        throw new BridgeSafeError(`merge refused: ${gate.reason}`);
      }
      if (!isMergeMethod(method)) {
        throw new BridgeSafeError(`unsupported merge method: ${method}`);
      }
      markSessionMobileShared(sessionId);
      await store.mergePr(sessionId, pr?.number, method);
      return undefined;
    }

    case 'spawnWorkflow': {
      const workflowId = asString(data.workflowId);
      const session = store.sessions.find((s) => s.id === asString(data.sessionId));
      const gate = evaluateMobileSpawnWorkflow({
        sessionId: data.sessionId,
        workflowId,
        sessions: store.sessions,
        workflowsForWorkspace: session ? (store.phaseTemplates[session.workspaceId] ?? []) : [],
      });
      if (!gate.ok) {
        throw new BridgeSafeError(`spawn workflow refused: ${gate.reason}`);
      }
      markSessionMobileShared(gate.sessionId);
      await store.attachWorkflowToSession(gate.sessionId, gate.workflowId, {
        autoRun: false,
        triggerMode: 'manual',
        navigate: false,
      });
      return undefined;
    }

    default:
      throw new BridgeSafeError(`unsupported mobile command: ${cmd.kind}`);
  }
}

function genericMaskFor(kind: string): string {
  switch (kind) {
    case 'mergePr':
      return 'merge failed';
    case 'spawnAgent':
    case 'resolveComment':
      return 'could not spawn agent';
    case 'setContextSlot':
      return 'could not update context';
    case 'advanceStep':
      return 'could not advance workflow';
    case 'spawnWorkflow':
      return 'could not attach workflow';
    case 'send':
      return 'send failed';
    case 'createSessionFromIssue':
      return 'could not create session';
    case 'queryFileDiff':
      return 'could not load file diff';
    default:
      return 'command failed';
  }
}

export async function executeBridgeCommand(
  cmd: BridgeCommand,
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    if (cmd.origin !== 'mobile') {
      throw new BridgeSafeError(`unexpected command origin: ${cmd.origin}`);
    }
    const data = await dispatchMobile(cmd);
    return data !== undefined ? { ok: true, data } : { ok: true };
  } catch (err) {
    if (err instanceof BridgeSafeError) {
      return { ok: false, error: err.message };
    }
    const data = asRecord(cmd.data);
    console.error(
      `[bridge] command failed (kind=${cmd.kind}, sessionId=${asString(data.sessionId) ?? '(none)'})`,
      err,
    );
    return { ok: false, error: genericMaskFor(cmd.kind) };
  }
}

export const listenBridgeCommands = async (): Promise<UnlistenFn> => {
  if (!inTauri() || !isMainWindow()) {
    return () => undefined;
  }
  return listen<BridgeCommand>(COMMAND_EVENT, (event) => {
    const cmd = event.payload;
    void executeBridgeCommand(cmd)
      .then((result) =>
        invoke('bridge_command_result', {
          id: cmd.id,
          ok: result.ok,
          error: result.error ?? null,
          data: result.data ?? null,
        }),
      )
      .catch((e) => console.error('[bridge] command result dispatch failed', e));
  });
};
