import type { MountId, PrSeriesId, PrSeriesView, ProjectId, SessionId } from '@goodboy/types';
import { resolveParentRequest } from '../../../store/slices/pr-series/parentRequest';
import { useAppStore } from '../../../store/store';

type BridgeArgs = Readonly<Record<string, unknown>>;

export type SeriesBridgeRequest = {
  readonly id: string;
  readonly provider: 'series';
  readonly verb: string;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId | null;
  readonly mountId: MountId | null;
  readonly requestId?: string;
  readonly args: BridgeArgs;
};

export type SeriesBridgeOutcome = {
  readonly ok: boolean;
  readonly error?: string;
  readonly code?: string;
  readonly data?: unknown;
};

const text = ({ args, key }: { readonly args: BridgeArgs; readonly key: string }): string => {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
};

const count = ({
  args,
  key,
}: {
  readonly args: BridgeArgs;
  readonly key: string;
}): number | null => {
  const value = args[key];
  return typeof value === 'number' ? value : null;
};

const truthy = ({ args, key }: { readonly args: BridgeArgs; readonly key: string }): boolean =>
  args[key] === true;

const seriesResult = (view: PrSeriesView): Record<string, unknown> => ({
  seriesId: view.id,
  projectId: view.projectId,
  name: view.name,
  plannedCount: view.plannedCount,
  workItem: view.workItemIdentifier,
  workItemUrl: view.workItemUrl,
  parentRequest: view.parentRequest,
  members: view.members.map((member) => ({
    memberId: member.id,
    position: member.ordinal,
    label: member.label,
    status: member.status,
    mountId: member.mountId,
    branch: member.branch,
    request:
      member.request === null
        ? null
        : {
            provider: member.request.provider,
            host: member.request.host,
            repo: member.request.repoSlug,
            number: member.request.prNumber,
            url: member.request.url,
            state: member.request.state,
          },
  })),
});

type Params = {
  readonly request: SeriesBridgeRequest;
};

const create = async ({ request }: Params): Promise<SeriesBridgeOutcome> => {
  if (request.projectId === null) {
    return {
      ok: false,
      error: 'a series belongs to one project: name it with --project <name>',
      code: 'mount_unavailable',
    };
  }
  const parentRequest = resolveParentRequest({
    provider: text({ args: request.args, key: 'parentProvider' }),
    host: text({ args: request.args, key: 'parentHost' }),
    repo: text({ args: request.args, key: 'parentRepo' }),
    number: count({ args: request.args, key: 'parentNumber' }),
  });
  const workItem = text({ args: request.args, key: 'workItem' });
  const workItemUrl = text({ args: request.args, key: 'workItemUrl' });
  const series = await useAppStore.getState().createPrSeries({
    sessionId: request.sessionId,
    projectId: request.projectId,
    name: text({ args: request.args, key: 'name' }),
    plannedCount: count({ args: request.args, key: 'total' }),
    workItemIdentifier: workItem === '' ? null : workItem,
    workItemUrl: workItemUrl === '' ? null : workItemUrl,
    parentRequest,
  });
  return {
    ok: true,
    data: {
      seriesId: series.id,
      projectId: series.projectId,
      name: series.name,
      plannedCount: series.plannedCount,
    },
  };
};

const setMember = async ({ request }: Params): Promise<SeriesBridgeOutcome> => {
  const position = count({ args: request.args, key: 'position' });
  if (position === null) {
    return { ok: false, error: '--position needs a positive whole number' };
  }
  const label = text({ args: request.args, key: 'label' });
  const member = await useAppStore.getState().setPrSeriesMember({
    sessionId: request.sessionId,
    seriesId: text({ args: request.args, key: 'series' }) as PrSeriesId,
    position,
    mountId: request.mountId,
    label: label === '' ? null : label,
    isOmitted: truthy({ args: request.args, key: 'omitted' }),
  });
  return {
    ok: true,
    data: {
      seriesId: member.seriesId,
      memberId: member.id,
      position: member.ordinal,
      mountId: member.mountId,
      branch: member.branch,
      status: member.status,
    },
  };
};

const list = async ({ request }: Params): Promise<SeriesBridgeOutcome> => {
  const views = await useAppStore.getState().loadPrSeries({
    sessionId: request.sessionId,
    ...(request.projectId === null ? {} : { projectId: request.projectId }),
  });
  return { ok: true, data: { series: views.map(seriesResult) } };
};

export const executeSeriesRequest = async ({ request }: Params): Promise<SeriesBridgeOutcome> => {
  switch (request.verb) {
    case 'create':
      return await create({ request });
    case 'set-member':
      return await setMember({ request });
    case 'list':
      return await list({ request });
    default:
      return { ok: false, error: `unhandled series command: ${request.verb}` };
  }
};
