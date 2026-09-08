import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn, Divider, Popover, ScrollFade, SectionHeader, Tooltip } from '@goodboy/ui';
import type {
  MountId,
  SessionId,
  WorkspaceId,
  ProjectScript,
  ProjectScriptId,
} from '@goodboy/types';
import { ChevronDown, ChevronRight, Play, Plus, Square, X } from 'lucide-react';
import { EMPTY_ARRAY, useAppStore } from '../../../../store';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import type { ScriptRunRecord, ScriptRunResult, ScriptRunStatus } from '../../scripts';
import { MountPicker } from './MountPicker';

type ScriptsSectionProps = {
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly forceExpanded?: boolean;
  readonly hideHeader?: boolean;
};

type LogTarget = {
  readonly scriptId: ProjectScriptId;
  readonly anchor: DOMRect;
};

type PickerTarget = {
  readonly script: ProjectScript;
  readonly anchor: DOMRect;
};

export const ScriptsSection = ({
  sessionId,
  workspaceId,
  forceExpanded = false,
  hideHeader = false,
}: ScriptsSectionProps) => {
  const storedExpanded = useAppStore((s) => s.sessionPanelExpanded[sessionId]?.scripts ?? false);
  const expanded = forceExpanded || storedExpanded;
  const setPanelSectionExpanded = useAppStore((s) => s.setPanelSectionExpanded);
  const [log, setLog] = useState<LogTarget | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const scripts = useAppStore((s) => s.projectScripts[workspaceId]);
  const allProjects = useAppStore((s) => s.projects);
  const mounts = useAppStore((s) => s.sessionProjectMounts[sessionId] ?? EMPTY_ARRAY);
  const mountsForProject = useCallback(
    (projectId: ProjectScript['projectId']) =>
      mounts.filter((candidate) => candidate.projectId === projectId),
    [mounts],
  );
  const runs = useAppStore((s) => s.scriptRuns[sessionId]);
  const loadScripts = useAppStore((s) => s.loadScripts);
  const runScript = useAppStore((s) => s.runScript);
  const cancelScript = useAppStore((s) => s.cancelScript);
  const setActiveLens = useAppStore((s) => s.setActiveLens);
  const setScriptsLensScope = useAppStore((s) => s.setScriptsLensScope);

  useEffect(() => {
    void loadScripts(workspaceId);
  }, [workspaceId, loadScripts]);

  const onRun = useCallback(
    (script: ProjectScript, anchor: DOMRect) => {
      const candidates = mountsForProject(script.projectId);
      if (candidates.length > 1) {
        setPicker({ script, anchor });
        return;
      }
      void runScript({ sessionId, scriptId: script.id });
    },
    [mountsForProject, runScript, sessionId],
  );

  const onCancel = useCallback(
    (scriptId: ProjectScriptId) => {
      void cancelScript(sessionId, scriptId);
    },
    [cancelScript, sessionId],
  );

  const onToggleLog = useCallback((scriptId: ProjectScriptId, anchor: DOMRect) => {
    setLog((prev) => (prev?.scriptId === scriptId ? null : { scriptId, anchor }));
  }, []);

  const list = scripts ?? [];
  const projects = allProjects.filter((project) => project.workspaceId === workspaceId);
  const isMultiProject = projects.length > 1;

  const openScripts = () => {
    setScriptsLensScope({ scope: null });
    setActiveLens(sessionId, 'scripts');
  };

  const logScript = log ? list.find((s) => s.id === log.scriptId) : null;
  const logResult = log ? (runs?.[log.scriptId]?.result ?? null) : null;

  return (
    <>
      {hideHeader ? null : (
        <SectionHeader
          className="mt-6 pb-1.5"
          icon={<CONCEPT_ICONS.scripts size={11} aria-hidden className="text-info" />}
          label="Scripts"
          action={
            <Tooltip content={`${expanded ? 'Collapse' : 'Expand'} scripts`}>
              <button
                type="button"
                onClick={() => setPanelSectionExpanded(sessionId, 'scripts', !storedExpanded)}
                aria-expanded={expanded}
                aria-label={`${expanded ? 'collapse' : 'expand'} scripts`}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                {expanded ? (
                  <ChevronDown size={ICON_SIZE.row} aria-hidden />
                ) : (
                  <ChevronRight size={ICON_SIZE.row} aria-hidden />
                )}
              </button>
            </Tooltip>
          }
        />
      )}
      {expanded ? (
        <>
          {list.length > 0 ? (
            <ul className="flex flex-col gap-1 pl-2">
              {list.map((script) => {
                const project = projects.find((candidate) => candidate.id === script.projectId);
                const projectName = project?.name ?? 'Project';
                const mount = mounts.find((candidate) => candidate.projectId === script.projectId);
                const disabledReason =
                  mount === undefined ? `${projectName} is not mounted in this session` : null;
                return (
                  <li key={script.id}>
                    <ScriptRow
                      script={script}
                      projectName={projectName}
                      showProjectName={isMultiProject}
                      run={runs?.[script.id] ?? null}
                      disabledReason={disabledReason}
                      logOpen={log?.scriptId === script.id}
                      onRun={(anchor) => onRun(script, anchor)}
                      onCancel={() => onCancel(script.id)}
                      onToggleLog={(anchor) => onToggleLog(script.id, anchor)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={openScripts}
            className="mt-1.5 flex w-full items-center gap-2 rounded border border-dashed border-border-soft px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground"
          >
            <Plus size={ICON_SIZE.row} aria-hidden className="shrink-0" />
            <span className="min-w-0 truncate">Create script</span>
          </button>
        </>
      ) : (
        <p className="pb-1 pl-2 text-2xs text-muted-foreground/60">
          {list.length === 0
            ? 'No scripts yet'
            : `${list.length} script${list.length === 1 ? '' : 's'}`}
        </p>
      )}
      {picker ? (
        <MountPicker
          scriptName={picker.script.name}
          mounts={mountsForProject(picker.script.projectId)}
          anchor={picker.anchor}
          onPick={(mountId: MountId) => {
            const scriptId = picker.script.id;
            setPicker(null);
            void runScript({ sessionId, scriptId, mountId });
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
      {logScript && logResult ? (
        <LogFlyout
          script={logScript}
          result={logResult}
          anchor={log!.anchor}
          onClose={() => setLog(null)}
        />
      ) : null}
    </>
  );
};

type ScriptRowProps = {
  readonly script: ProjectScript;
  readonly projectName: string;
  readonly showProjectName: boolean;
  readonly run: ScriptRunRecord | null;
  readonly disabledReason: string | null;
  readonly logOpen: boolean;
  readonly onRun: (anchor: DOMRect) => void;
  readonly onCancel: () => void;
  readonly onToggleLog: (anchor: DOMRect) => void;
};

function ScriptRow({
  script,
  projectName,
  showProjectName,
  run,
  disabledReason,
  logOpen,
  onRun,
  onCancel,
  onToggleLog,
}: ScriptRowProps) {
  const status: ScriptRunStatus = run?.status ?? 'idle';
  const result = run?.result ?? null;
  const isPending = status === 'pending';
  const hasOutput = result !== null;
  const logRef = useRef<HTMLButtonElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded border border-transparent px-2 py-1.5 transition-colors',
        !isPending && 'hover:bg-muted/60',
        isPending && 'border-info/50',
      )}
    >
      <StatusDot status={status} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1 text-xs">
        <span className="min-w-0 truncate font-medium text-foreground">{script.name}</span>
        {showProjectName ? (
          <span className="shrink-0 text-2xs text-muted-foreground">· {projectName}</span>
        ) : null}
      </span>
      {hasOutput ? (
        <button
          ref={logRef}
          type="button"
          onClick={() => {
            const rect = logRef.current?.getBoundingClientRect();
            if (rect) {
              onToggleLog(rect);
            }
          }}
          aria-expanded={logOpen}
          title={logOpen ? 'Hide log' : 'Show log'}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded transition-colors',
            logOpen
              ? 'bg-primary/15 text-primary ring-1 ring-primary/30 ring-inset'
              : 'text-muted-foreground/60 hover:bg-foreground/10 hover:text-foreground',
          )}
        >
          <CONCEPT_ICONS.terminal size={ICON_SIZE.row} aria-hidden />
        </button>
      ) : null}
      {isPending ? (
        <Tooltip content="Stop script">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Stop script"
            className="flex size-6 shrink-0 items-center justify-center rounded text-danger transition-colors hover:bg-danger/10"
          >
            <Square size={11} fill="currentColor" aria-hidden />
          </button>
        </Tooltip>
      ) : (
        <Tooltip content={disabledReason ?? 'Run script'} anchorClassName="shrink-0">
          <button
            ref={runRef}
            type="button"
            onClick={() => {
              const rect = runRef.current?.getBoundingClientRect();
              if (rect) {
                onRun(rect);
              }
            }}
            disabled={disabledReason != null}
            aria-label="Run script"
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-foreground/10 hover:text-primary group-hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play size={ICON_SIZE.row} aria-hidden />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

type LogFlyoutProps = {
  readonly script: ProjectScript;
  readonly result: ScriptRunResult;
  readonly anchor: DOMRect;
  readonly onClose: () => void;
};

function computePosition(anchor: DOMRect) {
  const margin = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(640, Math.max(480, vw - anchor.right - margin * 3));
  const height = Math.min(vh - margin * 2, 640);
  let left = anchor.right + 16;
  if (left + width > vw - margin) {
    left = anchor.left - 16 - width;
  }
  left = Math.max(margin, Math.min(left, vw - width - margin));
  const top = Math.max(margin, (vh - height) / 2);
  return { left, top, width, height };
}

function LogFlyout({ script, result, anchor: initialAnchor, onClose }: LogFlyoutProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const [pos, setPos] = useState(() => computePosition(initialAnchor));
  useEffect(() => {
    const recompute = () => setPos(computePosition(initialAnchor));
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [initialAnchor]);

  return createPortal(
    <Popover
      innerRef={panelRef}
      role="dialog"
      ariaLabel={`${script.name} log`}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
      }}
      className="z-popover flex flex-col"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {script.name}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground">exit {result.exitCode}</span>
        <Tooltip content="Close log">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close log"
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X size={ICON_SIZE.row} aria-hidden />
          </button>
        </Tooltip>
      </div>
      <Divider className="shrink-0" />
      <ScrollFade className="min-h-0 flex-1" viewportClassName="px-3 py-2">
        <pre className="m-0 whitespace-pre-wrap break-all font-mono text-2xs leading-relaxed text-foreground/80">
          {result.stdout}
          {result.stderr ? (
            <span className="text-danger">
              {result.stdout ? '\n' : ''}
              {result.stderr}
            </span>
          ) : null}
          {!result.stdout && !result.stderr && '(no output)'}
        </pre>
      </ScrollFade>
    </Popover>,
    document.body,
  );
}

function StatusDot({ status }: { readonly status: ScriptRunStatus }) {
  if (status === 'ok') {
    return (
      <span
        className="size-2 shrink-0 rounded-full bg-success"
        aria-label="Last run ok"
        role="img"
      />
    );
  }
  if (status === 'error') {
    return (
      <span
        className="size-2 shrink-0 rounded-full bg-danger"
        aria-label="Last run failed"
        role="img"
      />
    );
  }
  if (status === 'cancelled') {
    return (
      <span
        className="size-2 shrink-0 rounded-full bg-muted-foreground/50"
        aria-label="Last run cancelled"
        role="img"
      />
    );
  }
  return <span className="size-2 shrink-0 rounded-full bg-border" aria-hidden />;
}
