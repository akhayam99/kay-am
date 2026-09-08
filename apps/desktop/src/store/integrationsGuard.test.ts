import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  IntegrationBindingProvider,
  IsoDateTime,
  Project,
  ProjectId,
  WorkspaceId,
} from '@goodboy/types';
import { QUERY_BRIDGE_VERBS, buildIntegrationsGuard } from './integrationsGuard';
import { buildScopeGuard } from './scopeGuard';

const SESSION_SCOPED_PROVIDERS: ReadonlyArray<string> = ['project', 'mount'];

const catalogSource = (): string =>
  readFileSync(resolve(process.cwd(), 'src-tauri/src/query_bridge/protocol.rs'), 'utf8');

const catalogVerbs = (): Record<string, ReadonlyArray<string>> => {
  const entries = catalogSource().matchAll(
    /provider:\s*"([a-z]+)",\s*\n\s*verb:\s*"([a-z0-9-]+)"/g,
  );
  const out: Record<string, Array<string>> = {};
  for (const match of entries) {
    const provider = match[1] ?? '';
    const verb = match[2] ?? '';
    out[provider] = [...(out[provider] ?? []), verb];
  }
  return out;
};

describe('buildIntegrationsGuard', () => {
  it('says nothing when the workspace has no connection', () => {
    expect(buildIntegrationsGuard({ providers: [], isBridgeServing: true })).toBe('');
  });

  it('says nothing while the bridge is not serving, connections or not', () => {
    const guard = buildIntegrationsGuard({
      providers: ['linear', 'jira'],
      isBridgeServing: false,
    });

    expect(guard).toBe('');
    expect(guard).not.toContain('GOODBOY_BIN');
  });

  it('lists only the providers the workspace actually connected', () => {
    const guard = buildIntegrationsGuard({ providers: ['linear'], isBridgeServing: true });

    expect(guard).toContain('[integrations]');
    expect(guard).toContain('linear: issue,');
    expect(guard).not.toContain('jira:');
    expect(guard).not.toContain('slack:');
  });

  it('names the command an agent has to type', () => {
    const guard = buildIntegrationsGuard({ providers: ['linear'], isBridgeServing: true });

    expect(guard).toContain('"$GOODBOY_BIN" query linear issue ENG-123');
    expect(guard).toContain('"$GOODBOY_BIN" query <provider> --help');
  });

  it('quotes the binary so a path with a space still runs', () => {
    const guard = buildIntegrationsGuard({ providers: ['linear'], isBridgeServing: true });

    expect(guard).not.toMatch(/[^"]\$GOODBOY_BIN" query/);
    expect(guard).toContain('Keep the quotes');
  });

  it('never leaks a credential, a token or an MCP endpoint into the prompt', () => {
    const guard = buildIntegrationsGuard({
      providers: ['linear', 'sentry', 'github', 'gitlab', 'jira', 'bitbucket', 'slack'],
      isBridgeServing: true,
    });

    expect(guard).not.toMatch(/token|api[_ -]?key|secret|credential_id/i);
  });

  it('collapses a duplicated provider into a single line', () => {
    const guard = buildIntegrationsGuard({
      providers: ['linear', 'linear'],
      isBridgeServing: true,
    });

    expect(guard.split('\n').filter((line) => line.startsWith('linear:'))).toHaveLength(1);
  });

  it('stays short enough to ride along on every prompt', () => {
    const guard = buildIntegrationsGuard({
      providers: ['linear', 'sentry', 'github', 'gitlab', 'jira', 'bitbucket', 'slack'],
      isBridgeServing: true,
    });

    expect(guard.split('\n')).toHaveLength(14);
  });

  it('names the mount scope only for the providers that write to a checkout', () => {
    const withRequests = buildIntegrationsGuard({
      providers: ['linear', 'github'],
      isBridgeServing: true,
    });
    const withoutRequests = buildIntegrationsGuard({
      providers: ['linear', 'slack'],
      isBridgeServing: true,
    });

    expect(withRequests).toContain('act on ONE mount');
    expect(withRequests).toContain('pass `--mount <id>` to reach another one');
    expect(withoutRequests).not.toContain('act on ONE mount');
  });

  it('ignores a provider the bridge cannot serve', () => {
    const guard = buildIntegrationsGuard({
      providers: ['sourcehut' as IntegrationBindingProvider, 'linear'],
      isBridgeServing: true,
    });

    expect(guard).not.toContain('sourcehut');
    expect(guard).toContain('linear:');
  });

  it('lists github with its verbs when the workspace has a working gh connection', () => {
    const guard = buildIntegrationsGuard({ providers: ['github'], isBridgeServing: true });

    expect(guard).toContain('[integrations]');
    expect(guard).toContain(`github: ${QUERY_BRIDGE_VERBS.github.join(', ')}`);
    expect(guard).toContain('pr-thread-resolve');
    expect(guard).toContain('push');
  });

  it('leaves github out while the workspace has no gh connection', () => {
    const guard = buildIntegrationsGuard({
      providers: ['linear', 'slack'],
      isBridgeServing: true,
    });

    expect(guard).not.toContain('github');
    expect(guard).toContain('linear:');
    expect(guard).toContain('slack:');
  });

  it('ignores a name that only exists on the object prototype', () => {
    const guard = buildIntegrationsGuard({
      providers: [
        'toString' as IntegrationBindingProvider,
        'constructor' as IntegrationBindingProvider,
        'linear',
      ],
      isBridgeServing: true,
    });

    expect(guard).not.toContain('toString');
    expect(guard).not.toContain('constructor');
    expect(guard.split('\n')).toHaveLength(7);
  });
});

describe('the advertised verbs', () => {
  it('match the catalog the Rust bridge dispatches', () => {
    const rust = catalogVerbs();
    const integrationProviders = Object.keys(rust).filter(
      (provider) => !SESSION_SCOPED_PROVIDERS.includes(provider),
    );

    expect(integrationProviders.sort()).toEqual(Object.keys(QUERY_BRIDGE_VERBS).sort());
    for (const [provider, verbs] of Object.entries(QUERY_BRIDGE_VERBS)) {
      expect([...verbs].sort()).toEqual([...(rust[provider] ?? [])].sort());
    }
  });

  it('advertise the session-scoped project verbs through the scope guard instead', () => {
    const rust = catalogVerbs();

    expect(rust['project']).toEqual(['materialize']);
    expect(rust['mount']).toEqual([
      'list',
      'inspect',
      'fork',
      'switch',
      'attach',
      'unmount',
      'activate',
      'resolve',
      'operation',
    ]);
    const now = '2026-08-22T00:00:00.000Z' as IsoDateTime;
    const project: Project = {
      id: 'project-guard' as ProjectId,
      workspaceId: 'workspace-guard' as WorkspaceId,
      name: 'app',
      rootPath: '/tmp/app',
      kind: 'repo',
      overrides: {
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
      },
      createdAt: now,
      updatedAt: now,
    };
    const base = {
      containerDir: '/tmp/container',
      workingDir: '/tmp/container',
      projects: [project],
      mounts: [],
      isSessionDirScope: false,
      canWrite: true,
    };
    const guard = buildScopeGuard({ ...base, isBridgeServing: true });
    expect(guard).toContain('query project materialize');
    const silent = buildScopeGuard({ ...base, isBridgeServing: false });
    expect(silent).not.toContain('GOODBOY_BIN');
    expect(silent).toContain('<<materialize:');
  });
});
