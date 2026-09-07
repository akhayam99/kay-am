import { useEffect, useMemo, useRef, useState } from 'react';
import type { GitlabIntegrationBinding, WorkspaceId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { primaryProjectRoot } from '../../../workspace/primaryProjectRoot';
import {
  fetchIssueCandidates,
  type IssueCandidate,
} from '../../../integrations/fetchIssueCandidates';
import { resolveIssueSources, type IssueSource } from '../../../integrations/issueSources';
import { useToolConnections } from '../../../integrations/useToolConnections';
import type { TrackerProvider } from '../../../integrations/components/TrackerStudioLinks';
import { useJiraConfig } from '../../../integrations/jira/useJiraConfig';

const ROWS_PER_SOURCE = 5;

type Params = {
  readonly workspaceId: WorkspaceId;
};

type Result = {
  readonly connected: Readonly<Record<TrackerProvider, boolean>>;
  readonly hasSources: boolean;
  readonly rows: ReadonlyArray<IssueCandidate>;
  readonly isLoaded: boolean;
  readonly sources: ReadonlyArray<IssueSource>;
};

export const useKickoffIssues = ({ workspaceId }: Params): Result => {
  const { integrations, github, connected } = useToolConnections({ workspaceId });
  const rootPath = useAppStore((state) =>
    primaryProjectRoot({ projects: state.projects, workspaceId }),
  );
  const gitlabHost = useAppStore((state) => {
    const integration = (state.workspaceIntegrations[workspaceId] ?? []).find(
      (entry): entry is GitlabIntegrationBinding => entry.provider === 'gitlab',
    );
    return integration?.config.host ?? null;
  });
  const jiraConfig = useJiraConfig({ workspaceId });
  const externalTasks = useAppStore((state) => state.sessionExternalTasks);
  const [rowsByProvider, setRowsByProvider] = useState<
    Readonly<Record<string, ReadonlyArray<IssueCandidate>>>
  >({});
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const fetchedRef = useRef(new Set<string>());

  const sources = useMemo(
    () =>
      resolveIssueSources({
        integrations,
        isGithubAuthenticated: github.isAuthenticated,
      }).filter((source) => source.provider !== 'slack'),
    [github.isAuthenticated, integrations],
  );

  useEffect(() => {
    for (const source of sources) {
      if (fetchedRef.current.has(source.provider)) {
        continue;
      }
      fetchedRef.current.add(source.provider);
      void fetchIssueCandidates({
        provider: source.provider,
        workspaceId,
        rootPath,
        gitlabHost,
        jiraConfig,
      })
        .then((rows) => {
          setRowsByProvider((current) => ({ ...current, [source.provider]: rows }));
        })
        .catch(() => undefined)
        .finally(() => {
          setSettled((current) => new Set(current).add(source.provider));
        });
    }
  }, [gitlabHost, jiraConfig, rootPath, sources, workspaceId]);

  const linkedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const tasks of Object.values(externalTasks)) {
      for (const task of tasks) {
        keys.add(`${task.provider}:${task.externalId}`);
      }
    }
    return keys;
  }, [externalTasks]);

  const rows = useMemo(
    () =>
      sources.flatMap((source) =>
        (rowsByProvider[source.provider] ?? [])
          .filter((row) => !linkedKeys.has(`${row.provider}:${row.externalId}`))
          .slice(0, ROWS_PER_SOURCE),
      ),
    [linkedKeys, rowsByProvider, sources],
  );

  return {
    connected,
    hasSources: sources.length > 0,
    rows,
    isLoaded: sources.every((source) => settled.has(source.provider)),
    sources,
  };
};
