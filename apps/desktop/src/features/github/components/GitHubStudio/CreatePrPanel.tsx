import { useEffect, useMemo, useState } from 'react';
import type { SessionExternalTask, SessionId } from '@goodboy/types';
import {
  Button,
  Checkbox,
  cn,
  Divider,
  FieldRow,
  Input,
  ScrollFade,
  SectionHeader,
  SegmentedTabs,
  Skeleton,
  Textarea,
} from '@goodboy/ui';
import { AlertTriangle, ArrowRight, GitBranch, PenLine } from 'lucide-react';
import { ghBaseBranches } from '../../github';
import { closingIssueReferences } from '../../closingIssueReferences';
import { appendOperatorNotes } from '../../../session/utils/appendOperatorNotes';
import { AgentSpawnConfig } from '../../../session/components/AgentSpawnConfig';
import type { AgentSpawnConfigValue } from '../../../session/components/AgentSpawnConfig/AgentSpawnConfigValue';
import { taskModelAgentSpawnConfig } from '../../../session/components/AgentSpawnConfig/taskModelAgentSpawnConfig';
import { BranchCombobox } from '../../../worktree/BranchCombobox';
import type { LocalBranchInfo } from '../../../worktree/worktree';
import { EMPTY_ARRAY, useAppStore } from '../../../../store';
import { useToast } from '../../../../app/components/Toast';
import { useSessionRepo } from '../../../../store/slices/worktrees/useSessionRepo';
import { openUrl } from '../../../../shared/lib/editor';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { PANE_RHYTHM } from '@goodboy/ui';

type CreateMode = 'manual' | 'agent';

type Props = {
  readonly sessionId: SessionId;
  readonly defaultTitle: string;
  readonly closedPr?: { number: number; url: string };
  readonly onCreated: () => void;
  readonly onStudioClose: () => void;
  readonly onCancel?: () => void;
};

export const CreatePrPanel = ({
  sessionId,
  defaultTitle,
  closedPr,
  onCreated,
  onStudioClose,
  onCancel,
}: Props) => {
  const createPrForSession = useAppStore((s) => s.createPrForSession);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const { showToast } = useToast();
  const repo = useSessionRepo({ sessionId });
  const branch = repo?.branch ?? null;
  const projectRoot = repo?.repoRoot ?? null;
  const projectId = repo?.projectId;
  const session = useAppStore((s) => s.sessions.find((x) => x.id === sessionId) ?? null);
  const workspaceId = session?.workspaceId;
  const workspaceOverrides = useAppStore((s) =>
    workspaceId == null ? null : (s.workspaceOverrides?.[workspaceId] ?? null),
  );
  const resolvedAgentConfig = useMemo(
    () =>
      taskModelAgentSpawnConfig({
        task: 'pr_draft',
        preferences: workspaceOverrides?.taskModels,
        workspaceDefaultProviderId: workspaceOverrides?.defaultProviderId,
        sessionDefaultProviderId: session?.providerPreference?.defaultProvider ?? 'anthropic',
      }),
    [workspaceOverrides, session?.providerPreference?.defaultProvider],
  );

  const [mode, setMode] = useState<CreateMode>('manual');
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState('');
  const [base, setBase] = useState('');
  const [branches, setBranches] = useState<ReadonlyArray<string>>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [draft, setDraft] = useState(true);
  const [busy, setBusy] = useState<'create' | 'ai' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentConfig, setAgentConfig] = useState<AgentSpawnConfigValue>(resolvedAgentConfig);
  const [agentConfigUserTouched, setAgentConfigUserTouched] = useState(false);

  const branchOptions = useMemo<ReadonlyArray<LocalBranchInfo>>(
    () => branches.map((name) => ({ name, inUse: false, hasUncommitted: false })),
    [branches],
  );

  const linkedTasks = useAppStore(
    (s) => s.sessionExternalTasks[sessionId] ?? (EMPTY_ARRAY as ReadonlyArray<SessionExternalTask>),
  );
  const references = useMemo(
    () =>
      closingIssueReferences({
        tasks: linkedTasks,
        branch,
        body: mode === 'manual' ? body : '',
      }),
    [body, branch, linkedTasks, mode],
  );

  useEffect(() => {
    if (agentConfigUserTouched) {
      return;
    }
    setAgentConfig(resolvedAgentConfig);
  }, [agentConfigUserTouched, resolvedAgentConfig]);

  useEffect(() => {
    if (projectRoot == null) {
      setBranchesLoading(false);
      return;
    }
    let cancelled = false;
    setBranchesLoading(true);
    void ghBaseBranches(projectRoot, workspaceId, projectId).then(
      ({ defaultBranch, branches: list }) => {
        if (cancelled) {
          return;
        }
        setBranches(list);
        setBranchesLoading(false);
        if (defaultBranch != null) {
          setBase((cur) => (cur.trim() === '' ? defaultBranch : cur));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, projectRoot, workspaceId]);

  const onCreate = async () => {
    if (busy || title.trim().length === 0) {
      return;
    }
    setBusy('create');
    setError(null);
    try {
      await createPrForSession(sessionId, { title, body, base, draft });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const onCreateWithAi = async () => {
    if (busy) {
      return;
    }
    setBusy('ai');
    setError(null);
    try {
      const prompt = [
        `Open a GitHub pull request for this session's branch.`,
        ...(closedPr
          ? [
              `- IMPORTANT: a previous PR #${closedPr.number} (${closedPr.url}) on this branch was CLOSED on purpose. Open a brand new pull request. Do NOT reopen #${closedPr.number}, and do not be confused if you find that closed PR while checking.`,
            ]
          : []),
        `- Write a clear, conventional title and a concise description from the committed changes.`,
        `- Session goal: "${defaultTitle}".`,
        ...(references.length > 0
          ? [
              `- End the description with these lines exactly, so GitHub links the issues:\n${references.map((reference) => reference.line).join('\n')}`,
            ]
          : []),
        `- If this project defines a PR-creation skill, command, or template (look under .claude/), follow it.`,
        `- Open it as a ${draft ? 'draft' : 'ready-for-review'} PR.`,
        `Then run \`gh pr create\` to open it and report the PR URL.`,
      ].join('\n');
      const agentId = await spawnAgent(sessionId, {
        name: 'open pull request',
        initialPrompt: appendOperatorNotes({ prompt, hint: agentConfig.hint }),
        model: agentConfig.model,
        ...(agentConfig.provider !== '' && { provider: agentConfig.provider }),
        effort: agentConfig.effort,
        focus: 'none',
      });
      showToast('success', 'An agent is drafting the pull request. You can keep working.', {
        title: 'Agent started',
        action: {
          label: 'Open the agent',
          onClick: () => {
            void (async () => {
              await setCurrentSession(sessionId);
              await selectAgent(sessionId, agentId);
              onStudioClose();
            })();
          },
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollFade className="min-h-0 flex-1" viewportClassName={PANE_RHYTHM.body} fadeSize={24}>
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <SectionHeader
            label="Open a pull request"
            action={
              <span className="inline-flex items-center gap-1 font-mono text-2xs text-muted-foreground">
                <GitBranch size={11} aria-hidden />
                {branch ?? 'no branch'}
              </span>
            }
          />
          <section className="flex flex-col">
            <SectionHeader
              label="How"
              hint="Fill the pull request yourself, or hand it to an agent that drafts and opens it."
              action={
                <SegmentedTabs
                  ariaLabel="Creation mode"
                  size="sm"
                  options={[
                    { value: 'manual', label: 'Manual', icon: PenLine },
                    { value: 'agent', label: 'With an agent', icon: CONCEPT_ICONS.agents },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
              }
            />
            {mode === 'manual' ? (
              <>
                <FieldRow label="Title" help="A short summary of the change.">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Pull request title"
                    disabled={busy !== null}
                    aria-label="Pull request title"
                    className="h-8 w-full text-sm sm:w-96"
                    autoFocus
                  />
                </FieldRow>
                <Divider />
                <FieldRow label="Description" help="What changed and why. Markdown supported.">
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="What changed and why"
                    className="w-full text-sm sm:w-96"
                    autoGrow
                    minRows={3}
                    maxRows={12}
                    disabled={busy !== null}
                    aria-label="Pull request description"
                  />
                </FieldRow>
                <Divider />
                <FieldRow label="Base branch" help="The branch this pull request merges into.">
                  <div className="w-full sm:w-96">
                    {branchesLoading ? (
                      <Skeleton className="h-9 w-full rounded-md border border-border" />
                    ) : (
                      <BranchCombobox
                        branches={branchOptions}
                        value={base}
                        onChange={setBase}
                        disabled={busy !== null}
                        loading={false}
                      />
                    )}
                  </div>
                </FieldRow>
              </>
            ) : (
              <FieldRow
                label="Agent"
                layout="stacked"
                help="Routing and optional notes for the agent that drafts the title and description, then opens the pull request."
              >
                <AgentSpawnConfig
                  value={agentConfig}
                  onChange={(value) => {
                    setAgentConfigUserTouched(true);
                    setAgentConfig(value);
                  }}
                  disabled={busy !== null}
                />
              </FieldRow>
            )}
            {references.length > 0 && (
              <>
                <Divider />
                <FieldRow
                  label="Issue links"
                  help="Added to the description so GitHub closes these issues when this merges."
                >
                  <ul className="flex flex-col gap-1.5">
                    {references.map((reference) => (
                      <li key={reference.number} className="flex items-center gap-2">
                        <code
                          data-testid="pr-issue-reference"
                          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-2xs text-foreground"
                        >
                          {reference.line}
                        </code>
                        <button
                          type="button"
                          onClick={() => void openUrl(reference.url)}
                          className="truncate text-2xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {reference.identifier}
                        </button>
                      </li>
                    ))}
                  </ul>
                </FieldRow>
              </>
            )}
            <Divider />
            <FieldRow
              label="Open as draft"
              help="Creates the pull request in GitHub's draft state."
            >
              <Checkbox checked={draft} onChange={setDraft} disabled={busy !== null} />
            </FieldRow>
          </section>
        </section>
      </ScrollFade>

      <Divider />

      <footer className="shrink-0 px-6 py-3">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {error != null && (
              <span
                role="alert"
                className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-danger"
                title={error}
              >
                <AlertTriangle size={ICON_SIZE.row} aria-hidden className="shrink-0" />
                {error}
              </span>
            )}
          </div>
          {onCancel != null && (
            <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>
              Cancel
            </Button>
          )}
          {mode === 'manual' ? (
            <Button
              onClick={() => void onCreate()}
              disabled={busy !== null || title.trim().length === 0}
              className={cn(busy === 'create' && 'animate-border-pulse')}
            >
              {busy === 'create' ? (
                'Creating…'
              ) : (
                <>
                  Create PR
                  <ArrowRight size={ICON_SIZE.row} aria-hidden />
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => void onCreateWithAi()}
              disabled={busy !== null}
              className={cn(busy === 'ai' && 'animate-border-pulse')}
            >
              {busy === 'ai' ? (
                'Drafting…'
              ) : (
                <>
                  <CONCEPT_ICONS.agents size={ICON_SIZE.row} aria-hidden />
                  Draft with agent
                </>
              )}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
};
