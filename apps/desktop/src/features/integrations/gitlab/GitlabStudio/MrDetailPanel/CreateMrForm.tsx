import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Divider,
  FieldRow,
  formatError,
  Input,
  ScrollFade,
  SectionHeader,
  SegmentedTabs,
  Textarea,
} from '@goodboy/ui';
import { AlertTriangle, ArrowRight, PenLine } from 'lucide-react';
import type { SessionId } from '@goodboy/types';
import { appendOperatorNotes } from '../../../../session/utils/appendOperatorNotes';
import { AgentSpawnConfig } from '../../../../session/components/AgentSpawnConfig';
import type { AgentSpawnConfigValue } from '../../../../session/components/AgentSpawnConfig/AgentSpawnConfigValue';
import { taskModelAgentSpawnConfig } from '../../../../session/components/AgentSpawnConfig/taskModelAgentSpawnConfig';
import { useAppStore } from '../../../../../store';
import { useToast } from '../../../../../app/components/Toast';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import { PANE_RHYTHM } from '@goodboy/ui';

type CreateMode = 'manual' | 'agent';

type Props = {
  readonly sessionId: SessionId;
  readonly branch: string | null;
  readonly error: string | null;
  readonly onClose: () => void;
};

export const CreateMrForm = ({ sessionId, branch, error, onClose }: Props) => {
  const session = useAppStore((s) => s.sessions.find((x) => x.id === sessionId) ?? null);
  const workspaceOverrides = useAppStore((s) =>
    session == null ? null : (s.workspaceOverrides?.[session.workspaceId] ?? null),
  );
  const createMrForSession = useAppStore((s) => s.createMrForSession);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const { showToast } = useToast();

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetBranch, setTargetBranch] = useState('main');
  const [draft, setDraft] = useState(true);
  const [busy, setBusy] = useState<'create' | 'agent' | null>(null);
  const [agentConfig, setAgentConfig] = useState<AgentSpawnConfigValue>(resolvedAgentConfig);
  const [agentConfigUserTouched, setAgentConfigUserTouched] = useState(false);

  useEffect(() => {
    if (agentConfigUserTouched) {
      return;
    }
    setAgentConfig(resolvedAgentConfig);
  }, [agentConfigUserTouched, resolvedAgentConfig]);

  useEffect(() => {
    setTitle(session?.goal ?? '');
  }, [session?.goal]);

  if (session == null) {
    return null;
  }

  const onCreate = async () => {
    if (busy !== null || title.trim().length === 0) {
      return;
    }
    setBusy('create');
    try {
      await createMrForSession({
        sessionId,
        title: title.trim(),
        description,
        targetBranch: targetBranch.trim() || 'main',
        draft,
      });
      showToast('success', 'Merge request created');
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusy(null);
    }
  };

  const onCreateWithAgent = async () => {
    if (busy !== null) {
      return;
    }
    setBusy('agent');
    try {
      const prompt = [
        `Open a GitLab merge request for this session's branch.`,
        `- Write a clear, conventional title and a concise description from the committed changes.`,
        `- Session goal: "${session.goal}".`,
        `- Target branch: ${targetBranch.trim() || 'main'}.`,
        `- If this project defines an MR-creation skill, command, or template (look under .claude/), follow it.`,
        `- Open it as a ${draft ? 'draft' : 'ready-for-review'} merge request.`,
        `Then open it with \`glab mr create\` (or the GitLab REST API if glab is unavailable) and report the MR URL.`,
      ].join('\n');
      const agentId = await spawnAgent(sessionId, {
        name: 'open merge request',
        initialPrompt: appendOperatorNotes({ prompt, hint: agentConfig.hint }),
        model: agentConfig.model,
        ...(agentConfig.provider !== '' && { provider: agentConfig.provider }),
        effort: agentConfig.effort,
        focus: 'none',
      });
      showToast('success', 'An agent is drafting the merge request. You can keep working.', {
        title: 'Agent started',
        action: {
          label: 'Open the agent',
          onClick: () => {
            void (async () => {
              await setCurrentSession(sessionId);
              await selectAgent(sessionId, agentId);
              onClose();
            })();
          },
        },
      });
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollFade className="min-h-0 flex-1" viewportClassName={PANE_RHYTHM.body} fadeSize={24}>
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <section className="flex flex-col">
            <SectionHeader
              label="How"
              hint="Fill the merge request yourself, or hand it to an agent that drafts and opens it."
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
                    disabled={busy !== null}
                    aria-label="Merge request title"
                    className="h-8 w-full text-sm sm:w-96"
                  />
                </FieldRow>
                <Divider />
                <FieldRow label="Description" help="What changed and why. Markdown supported.">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    autoGrow
                    minRows={3}
                    maxRows={10}
                    disabled={busy !== null}
                    aria-label="Merge request description"
                    className="w-full text-sm sm:w-96"
                  />
                </FieldRow>
                <Divider />
                <FieldRow label="Target branch" help="The branch this merge request merges into.">
                  <Input
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    placeholder="main"
                    className="h-8 w-full font-mono text-sm sm:w-96"
                    disabled={busy !== null}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Target branch"
                  />
                </FieldRow>
              </>
            ) : (
              <FieldRow
                label="Agent"
                layout="stacked"
                help="Routing and optional notes for the agent that drafts the title and description, then opens the merge request."
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
            <Divider />
            <FieldRow
              label="Open as draft"
              help="Creates the merge request in GitLab's draft state."
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
            {error != null ? (
              <span
                role="alert"
                className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-danger"
                title={error}
              >
                <AlertTriangle size={ICON_SIZE.row} aria-hidden className="shrink-0" />
                {error}
              </span>
            ) : null}
          </div>
          {mode === 'manual' ? (
            <Button
              onClick={() => void onCreate()}
              disabled={busy !== null || title.trim().length === 0 || branch == null}
              className={busy === 'create' ? 'animate-border-pulse' : undefined}
            >
              {busy === 'create' ? (
                'Creating…'
              ) : (
                <>
                  Create MR
                  <ArrowRight size={ICON_SIZE.row} aria-hidden />
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => void onCreateWithAgent()}
              disabled={busy !== null || branch == null}
              className={busy === 'agent' ? 'animate-border-pulse' : undefined}
            >
              {busy === 'agent' ? (
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
