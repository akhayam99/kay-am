import type {
  AgentId,
  MaterializationDeferralCause,
  Project,
  ProviderRunId,
  SessionId,
} from '@goodboy/types';
import type { GetFn } from './slice-types';

export const IMMEDIATE_MATERIALIZE_CAP = 2;
export const UNNAMED_FOOTPRINT_CAP = 2;

export type MaterializationDecision =
  | { readonly kind: 'mounted' }
  | { readonly kind: 'allowed' }
  | { readonly kind: 'deferred'; readonly cause: MaterializationDeferralCause };

type GoalNamesProjectParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly projectName: string;
};

const goalNamesProject = ({ get, sessionId, projectName }: GoalNamesProjectParams): boolean => {
  const needle = projectName.toLowerCase();
  if (needle === '') {
    return false;
  }
  const session = get().sessions.find((candidate) => candidate.id === sessionId);
  const goalSlot = (get().sessionSlots[sessionId] ?? []).find((slot) => slot.key === 'goal');
  const tasks = get().sessionExternalTasks[sessionId] ?? [];
  const haystacks = [
    session?.goal ?? '',
    goalSlot?.value ?? '',
    ...tasks.flatMap((task) => [task.title, task.identifier]),
  ];
  return haystacks.some((text) => text.toLowerCase().includes(needle));
};

const asCount = ({ value }: { readonly value: number }): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

type PriorMountsParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
};

export const priorMountCount = ({ get, sessionId }: PriorMountsParams): number =>
  (get().sessionProjectMounts[sessionId] ?? []).length;

type GateParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly project: Project;
  readonly priorMounts: number;
  readonly immediateCount: number;
};

export const materializationGate = ({
  get,
  sessionId,
  project,
  priorMounts,
  immediateCount,
}: GateParams): MaterializationDecision => {
  const mounts = get().sessionProjectMounts[sessionId] ?? [];
  if (mounts.some((mount) => mount.projectId === project.id)) {
    return { kind: 'mounted' };
  }
  const immediate = asCount({ value: immediateCount });
  if (immediate >= IMMEDIATE_MATERIALIZE_CAP) {
    return { kind: 'deferred', cause: 'batch' };
  }
  if (goalNamesProject({ get, sessionId, projectName: project.name })) {
    return { kind: 'allowed' };
  }
  const prior = asCount({ value: priorMounts });
  const fitsSnapshot = prior + immediate < UNNAMED_FOOTPRINT_CAP;
  const fitsLiveCount = mounts.length < UNNAMED_FOOTPRINT_CAP;
  return fitsSnapshot && fitsLiveCount ? { kind: 'allowed' } : { kind: 'deferred', cause: 'scope' };
};

const sessionBatches = new Map<SessionId, Promise<unknown>>();

type BatchParams<T> = {
  readonly sessionId: SessionId;
  readonly run: () => Promise<T>;
};

export const runMaterializationBatch = async <T>({
  sessionId,
  run,
}: BatchParams<T>): Promise<T> => {
  const previous = sessionBatches.get(sessionId) ?? Promise.resolve();
  const next = previous.then(run, run);
  sessionBatches.set(
    sessionId,
    next.catch(() => undefined),
  );
  try {
    return await next;
  } finally {
    if (sessionBatches.get(sessionId) === next) {
      sessionBatches.delete(sessionId);
    }
  }
};

type ProposeParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly project: Project;
  readonly reason: string;
  readonly cause: MaterializationDeferralCause;
  readonly agentId: AgentId | null;
  readonly turnRunId: ProviderRunId | null;
};

export const proposeMaterialization = async ({
  get,
  sessionId,
  project,
  reason,
  cause,
  agentId,
  turnRunId,
}: ProposeParams): Promise<void> => {
  await get().recordSessionEvent({
    sessionId,
    kind: 'project_materialization_proposed',
    payload: {
      projectId: project.id,
      projectName: project.name,
      reason,
      deferralCause: cause,
      ...(agentId == null ? {} : { agentId }),
      ...(turnRunId == null ? {} : { turnRunId }),
    },
  });
};

const DEFERRAL_TAIL =
  "A mount suggestion is available in this session's projects section or the requesting agent's conversation.";

export const deferredMaterializeNote = ({
  projectName,
}: {
  readonly projectName: string;
}): string => `Mount deferred for ${projectName}.`;

type DeferredMessageParams = {
  readonly projectName: string;
  readonly cause: MaterializationDeferralCause;
};

export const deferredMaterializeMessage = ({
  projectName,
  cause,
}: DeferredMessageParams): string => {
  switch (cause) {
    case 'scope':
      return `Mount deferred for ${projectName}: adding an unnamed project beyond this session's two-project allowance requires approval. ${DEFERRAL_TAIL}`;
    case 'batch':
      return `Mount deferred for ${projectName}: this request has already mounted two projects. ${DEFERRAL_TAIL}`;
    default: {
      const exhaustive: never = cause;
      return exhaustive;
    }
  }
};
