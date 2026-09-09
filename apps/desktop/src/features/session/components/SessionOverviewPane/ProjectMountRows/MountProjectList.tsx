import { useMemo, useState } from 'react';
import { ScrollFade, cn, formatError } from '@goodboy/ui';
import type { Project, SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../../store';
import { ICON_SIZE, projectGlyph } from '../../../../../shared/components/conceptIcons';

const MANUAL_REASON = 'added manually by the user';
const SEARCH_THRESHOLD = 8;

type Props = {
  readonly sessionId: SessionId;
  readonly projects: ReadonlyArray<Project>;
  readonly onDone: () => void;
};

type MountParams = {
  readonly project: Project;
};

export const MountProjectList = ({ sessionId, projects, onDone }: Props) => {
  const materializeProject = useAppStore((state) => state.materializeProject);
  const emitNotification = useAppStore((state) => state.emitNotification);
  const [query, setQuery] = useState('');
  const [mountingProjectId, setMountingProjectId] = useState<Project['id'] | null>(null);
  const isBusy = mountingProjectId !== null;
  const isSearchable = projects.length > SEARCH_THRESHOLD;
  const filtered = useMemo(
    () => projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  );

  const mountProject = async ({ project }: MountParams) => {
    setMountingProjectId(project.id);
    try {
      await materializeProject({ sessionId, projectId: project.id, reason: MANUAL_REASON });
      setQuery('');
      onDone();
    } catch (error) {
      void emitNotification('error', 'warning', 'could not add the project', formatError(error), {
        sessionId,
        workspaceId: project.workspaceId,
      });
    } finally {
      setMountingProjectId(null);
    }
  };

  return (
    <div className="flex flex-col">
      {isSearchable ? (
        <input
          type="text"
          value={query}
          aria-label="Search projects"
          placeholder="Search projects…"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          className="border-b border-border-soft bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
        />
      ) : null}
      {filtered.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">No matching projects</p>
      ) : (
        <ScrollFade className="max-h-56" viewportClassName="py-0.5" fadeFrom="subtle">
          <ul>
            {filtered.map((project) => {
              const GlyphIcon = projectGlyph({ kind: project.kind });
              const isMounting = mountingProjectId === project.id;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    disabled={isBusy}
                    aria-label={`Mount ${project.name}`}
                    aria-busy={isMounting}
                    onClick={() => void mountProject({ project })}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-foreground motion-safe:transition-colors hover:bg-muted/40',
                      isBusy && !isMounting && 'pointer-events-none opacity-50',
                      isMounting && 'spin-border spin-border-info',
                    )}
                  >
                    <GlyphIcon
                      size={ICON_SIZE.row}
                      aria-hidden
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollFade>
      )}
    </div>
  );
};
