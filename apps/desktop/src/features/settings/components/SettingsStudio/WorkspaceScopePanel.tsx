import { useEffect, useState } from 'react';
import type { VerbosityLevel, WorkspaceId } from '@goodboy/types';
import {
  Button,
  cn,
  Divider,
  FieldRow,
  formatError,
  PANE_RHYTHM,
  ScrollFade,
  SectionHeader,
  Switch,
} from '@goodboy/ui';
import { Check, GitBranch, Unplug } from 'lucide-react';
import { SkillsPanel } from '../../../../features/skills/components/SkillsPanel';
import { WorkspaceProfileSection } from './WorkspaceProfileSection';
import { WorkspaceProjectsSection } from './WorkspaceProjectsSection';
import { OrphanWorktreesSection } from '../../../../features/worktree/components/OrphanWorktreesSection';
import { VerbositySelect } from '../../../../features/session/components/VerbositySelect';
import { DEFAULT_BRANCH_PREFIX } from '../../../../features/settings/settings';
import { WORKSPACE_FEATURES } from '../../../../shared/lib/features';
import { useAppStore } from '../../../../store';
import { primaryProjectRoot } from '../../../../features/workspace/primaryProjectRoot';
import { useToast } from '../../../../app/components/Toast';
import { useSectionAnchors } from '../../hooks/useSectionAnchors';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { isAttributionEnabled } from '../../../../shared/utils/attribution';

type Props = {
  readonly workspaceId: WorkspaceId;
  readonly initialSection?: string;
  readonly requestClose: () => void;
};

export const WorkspaceScopePanel = ({ workspaceId, initialSection, requestClose }: Props) => {
  const disconnect = useAppStore((s) => s.deleteWorkspace);
  const workspace = useAppStore((s) => s.workspaces.find((w) => w.id === workspaceId) ?? null);
  const projectRoot = useAppStore((s) => primaryProjectRoot({ projects: s.projects, workspaceId }));
  const renameWorkspace = useAppStore((s) => s.renameWorkspace);
  const wsOverrides = useAppStore((s) => s.workspaceOverrides[workspaceId] ?? null);
  const storeSetWorkspaceOverrides = useAppStore((s) => s.setWorkspaceOverrides);
  const { showToast } = useToast();

  const [displayName, setDisplayName] = useState(workspace?.name ?? '');
  const [renaming, setRenaming] = useState(false);
  const [branchPrefix, setBranchPrefix] = useState(DEFAULT_BRANCH_PREFIX);
  const [savedBranchPrefix, setSavedBranchPrefix] = useState(DEFAULT_BRANCH_PREFIX);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const { anchor } = useSectionAnchors({ section: initialSection });

  const verbosity = wsOverrides?.defaultVerbosity ?? 'normal';
  const parallelAgents = wsOverrides?.parallelAgents ?? false;
  const attributionFooter = isAttributionEnabled({ overrides: wsOverrides });

  useEffect(() => {
    const value = wsOverrides?.defaultBranchPrefix ?? DEFAULT_BRANCH_PREFIX;
    setBranchPrefix(value);
    setSavedBranchPrefix(value);
  }, [workspaceId, wsOverrides?.defaultBranchPrefix]);

  useEffect(() => {
    setDisplayName(workspace?.name ?? '');
  }, [workspace?.name]);

  const persistOverrides = async (
    partial: Partial<{
      defaultVerbosity: VerbosityLevel;
      parallelAgents: boolean;
      attributionFooter: boolean;
      defaultBranchPrefix: string;
    }>,
    successMessage: string,
  ) => {
    setBusy(true);
    try {
      await storeSetWorkspaceOverrides(workspaceId, {
        defaultProviderId: wsOverrides?.defaultProviderId ?? null,
        defaultWorkflowId: wsOverrides?.defaultWorkflowId ?? null,
        defaultBranchPrefix: wsOverrides?.defaultBranchPrefix ?? null,
        parallelEnabled: wsOverrides?.parallelEnabled ?? null,
        defaultVerbosity: verbosity,
        providerBindings: wsOverrides?.providerBindings ?? null,
        taskModels: wsOverrides?.taskModels ?? null,
        roleModels: wsOverrides?.roleModels ?? null,
        parallelAgents,
        providerPool: wsOverrides?.providerPool ?? null,
        attributionFooter,
        ...partial,
      });
      showToast('success', successMessage);
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const commitDisplayName = async () => {
    const next = displayName.trim();
    if (workspace == null || next === '' || next === workspace.name) {
      setDisplayName(workspace?.name ?? '');
      return;
    }
    setRenaming(true);
    try {
      await renameWorkspace({ workspaceId, name: next });
      showToast('success', 'workspace renamed');
    } catch (err) {
      showToast('error', formatError(err));
      setDisplayName(workspace.name);
    } finally {
      setRenaming(false);
    }
  };

  const commitBranchPrefix = async () => {
    const next = branchPrefix.trim() || DEFAULT_BRANCH_PREFIX;
    if (next === savedBranchPrefix) {
      setBranchPrefix(next);
      return;
    }
    setBusy(true);
    try {
      await storeSetWorkspaceOverrides(workspaceId, {
        defaultProviderId: wsOverrides?.defaultProviderId ?? null,
        defaultWorkflowId: wsOverrides?.defaultWorkflowId ?? null,
        defaultBranchPrefix: next,
        parallelEnabled: wsOverrides?.parallelEnabled ?? null,
        defaultVerbosity: verbosity,
        providerBindings: wsOverrides?.providerBindings ?? null,
        taskModels: wsOverrides?.taskModels ?? null,
        roleModels: wsOverrides?.roleModels ?? null,
        parallelAgents,
        providerPool: wsOverrides?.providerPool ?? null,
        attributionFooter,
      });
      setBranchPrefix(next);
      setSavedBranchPrefix(next);
      showToast('success', 'branch prefix saved');
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect(workspaceId);
      requestClose();
    } catch (err) {
      showToast('error', formatError(err));
      setDisconnecting(false);
    }
  };

  const sanitized = (input: string): string =>
    input
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '')
      .replace(/^-+/, '')
      .slice(0, 16);

  const folderName = projectRoot?.split('/').filter(Boolean).at(-1) ?? 'the workspace folder';

  return (
    <ScrollFade className="h-full w-full" viewportClassName={PANE_RHYTHM.body}>
      <div className={`flex flex-col ${PANE_RHYTHM.column} ${PANE_RHYTHM.measure.reading}`}>
        <div className="flex flex-col gap-6">
          {workspace == null ? null : (
            <>
              <section
                id="identity"
                ref={anchor({ id: 'identity' })}
                className="flex flex-col gap-4"
              >
                <SectionHeader
                  label="Workspace"
                  hint="How this workspace is labelled across the app."
                />
                <FieldRow label="Display name" help={`The folder on disk stays ${folderName}.`}>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onBlur={() => void commitDisplayName()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void commitDisplayName();
                      }
                      if (e.key === 'Escape') {
                        setDisplayName(workspace.name);
                      }
                    }}
                    placeholder={folderName}
                    disabled={renaming}
                    maxLength={60}
                    aria-label="Display name"
                    className={cn(
                      'h-8 w-56 rounded-md border border-border bg-background px-2 text-sm text-foreground motion-safe:transition-colors',
                      'placeholder:text-muted-foreground/40',
                      'hover:border-border-strong focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                      renaming && 'cursor-not-allowed opacity-50',
                    )}
                  />
                </FieldRow>
              </section>

              <Divider />

              <div ref={anchor({ id: 'projects' })}>
                <WorkspaceProjectsSection workspaceId={workspaceId} />
              </div>

              <Divider />

              <div ref={anchor({ id: 'profile' })}>
                <WorkspaceProfileSection workspaceId={workspaceId} />
              </div>

              <Divider />
            </>
          )}

          <section id="general" ref={anchor({ id: 'general' })} className="flex flex-col gap-4">
            <SectionHeader
              label="Session defaults"
              hint="Applied to every new agent you spawn in this workspace."
            />
            <div className="flex flex-col">
              <FieldRow label="Branch prefix" help="Prefixes every new session branch.">
                <div className="flex items-center gap-1.5">
                  <GitBranch
                    size={ICON_SIZE.row}
                    aria-hidden
                    className="shrink-0 text-muted-foreground"
                  />
                  <input
                    type="text"
                    value={branchPrefix}
                    onChange={(e) => setBranchPrefix(sanitized(e.target.value))}
                    onBlur={() => void commitBranchPrefix()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void commitBranchPrefix();
                      }
                    }}
                    placeholder={DEFAULT_BRANCH_PREFIX}
                    disabled={busy}
                    maxLength={16}
                    size={12}
                    aria-label="Branch prefix"
                    className={cn(
                      'h-8 rounded-md border border-border bg-background px-2 font-mono text-sm text-foreground motion-safe:transition-colors',
                      'placeholder:text-muted-foreground/40',
                      'hover:border-border-strong focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                      busy && 'cursor-not-allowed opacity-50',
                    )}
                  />
                  <span className="font-mono text-sm text-muted-foreground">/&lt;slug&gt;</span>
                </div>
              </FieldRow>

              <FieldRow label="Output verbosity" help="Response style for agents.">
                <div className="w-40">
                  <VerbositySelect
                    value={verbosity}
                    onChange={(v) =>
                      void persistOverrides({ defaultVerbosity: v }, 'verbosity updated')
                    }
                    disabled={busy}
                  />
                </div>
              </FieldRow>

              <FieldRow
                label="Parallel agents"
                help="Lets eligible agents split independent work and reconcile it in one output."
              >
                <Switch
                  label={parallelAgents ? 'On' : 'Off'}
                  checked={parallelAgents}
                  disabled={busy}
                  onChange={(next) =>
                    void persistOverrides(
                      { parallelAgents: next },
                      next ? 'parallel agents on' : 'parallel agents off',
                    )
                  }
                />
              </FieldRow>

              <FieldRow
                label="Attribution line"
                help="Signs every comment Goodboy posts to GitHub, GitLab, Bitbucket, Jira, Linear and Slack."
              >
                <Switch
                  label={attributionFooter ? 'On' : 'Off'}
                  checked={attributionFooter}
                  disabled={busy}
                  onChange={(next) =>
                    void persistOverrides(
                      { attributionFooter: next },
                      next ? 'attribution line on' : 'attribution line off',
                    )
                  }
                />
              </FieldRow>
            </div>
          </section>

          {WORKSPACE_FEATURES.skills ? (
            <>
              <Divider />
              <div ref={anchor({ id: 'skills' })}>
                <SkillsPanel workspaceId={workspaceId} />
              </div>
            </>
          ) : null}

          <div ref={anchor({ id: 'orphans' })}>
            <OrphanWorktreesSection workspaceId={workspaceId} />
          </div>

          <Divider />

          <section id="danger" ref={anchor({ id: 'danger' })} className="flex flex-col gap-4">
            <SectionHeader label="Danger zone" hint="Destructive workspace controls." />
            <FieldRow
              label="Disconnect workspace"
              help="Hides it from the sidebar. Nothing on disk is deleted, re-add the path to bring it back."
            >
              {!confirmDisconnect ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={disconnecting}
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                >
                  <Unplug size={ICON_SIZE.row} aria-hidden />
                  Disconnect
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-danger/5 px-2 py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDisconnect(false)}
                    disabled={disconnecting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void onDisconnect()}
                    disabled={disconnecting}
                    className={disconnecting ? 'animate-border-pulse' : undefined}
                  >
                    {disconnecting ? (
                      'Disconnecting…'
                    ) : (
                      <>
                        <Check size={ICON_SIZE.row} aria-hidden />
                        Confirm
                      </>
                    )}
                  </Button>
                </div>
              )}
            </FieldRow>
          </section>
        </div>
      </div>
    </ScrollFade>
  );
};
