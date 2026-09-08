import type { Project, SessionProjectMount } from '@goodboy/types';

type ScopeGuardParams = {
  readonly workingDir: string;
  readonly projects: ReadonlyArray<Project>;
  readonly mounts: ReadonlyArray<SessionProjectMount>;
  readonly isBridgeServing: boolean;
  readonly isSessionDirScope: boolean;
  readonly canWrite: boolean;
};

type ProjectLineParams = {
  readonly project: Project;
  readonly mounts: ReadonlyArray<SessionProjectMount>;
};

const mountSummary = ({ mount }: { readonly mount: SessionProjectMount }): string => {
  const branch = mount.branch === '' ? 'no branch' : `branch ${mount.branch}`;
  return `${mount.worktreePath} (${branch})`;
};

const projectLine = ({ project, mounts }: ProjectLineParams): string => {
  const owned = mounts.filter((candidate) => candidate.projectId === project.id);
  const identity = `- ${project.name} (${project.kind}) root: ${project.rootPath}`;
  if (owned.length === 0) {
    return `${identity} | NOT materialized: read it freely, mount it only to write`;
  }
  const summaries = owned.map((mount) => mountSummary({ mount })).join(', ');
  return `${identity} | materialized at ${summaries}`;
};

type MaterializeLineParams = {
  readonly isBridgeServing: boolean;
};

const MOUNT_RULE_LINES: ReadonlyArray<string> = [
  'Reading any project root listed above is free and needs no mount. NEVER materialize a project to read it, to run its tests, or because it looks related to the goal.',
  'Materialize ONLY a project whose files you must edit to finish this goal. Most goals need exactly one project, and when the goal names a project that project is the one.',
  'A mount the goal does not name waits for the owner to approve it, so ask for one only when you are about to write.',
];

const materializeLine = ({ isBridgeServing }: MaterializeLineParams): string => {
  const marker =
    'To materialize the project you must write to, emit on its own line: <<materialize: <project name> | <why you need it>>> and the mount is ready from your next turn.';
  if (!isBridgeServing) {
    return `${marker} After emitting the marker, end your turn. The mount is ready on the next one.`;
  }
  return `${marker} For an immediate mount, run \`"$GOODBOY_BIN" query project materialize <name> --reason "<why you need it>"\`; it prints the mount path and branch, or tells you the mount was deferred to the owner.`;
};

type MountCommandParams = {
  readonly isBridgeServing: boolean;
  readonly mounts: ReadonlyArray<SessionProjectMount>;
};

const mountCommandLines = ({
  isBridgeServing,
  mounts,
}: MountCommandParams): ReadonlyArray<string> => {
  if (!isBridgeServing || mounts.length === 0) {
    return [];
  }
  return [
    'Each mount has an id: `"$GOODBOY_BIN" query mount list` shows them, and `mount inspect|fork|switch|attach|unmount|activate --mount <id> --reason "<why>" --request-id <unique>` acts on one. Cutting a branch to start a second line of work with its own pull request is `mount fork`; moving this mount onto another branch is `mount switch`. Declare which one you mean, Goodboy never infers it from git.',
  ];
};

const WRITE_BOUNDARY_LINE =
  'ALL writes (Write/Edit/Bash file mutations) MUST resolve inside the session directory or a materialized project mount. NEVER write to a project root or any path outside them.';

const STRICT_DIR_LINES: ReadonlyArray<string> = [
  'ALL file operations (Read/Write/Edit/Bash file paths) MUST resolve inside this directory.',
  'NEVER write to absolute paths that exit this directory.',
  'Prefer paths relative to your current working directory. If a request implies editing files outside this directory, stop and ask for explicit confirmation before touching them.',
];

const STRICT_WORKTREE_LINES: ReadonlyArray<string> = [
  'ALL file operations (Read/Write/Edit/Bash file paths) MUST resolve inside this worktree.',
  'NEVER write to absolute paths that exit this directory, especially not to the parent project checkout.',
  'Prefer paths relative to your current working directory. If a user request implies editing files outside the worktree, stop and ask for explicit confirmation before touching them.',
];

type GuardTag = 'worktree-scope' | 'session-directory-scope' | 'projects-scope';

type TagParams = {
  readonly mounts: ReadonlyArray<SessionProjectMount>;
  readonly isSessionDirScope: boolean;
};

const guardTag = ({ mounts, isSessionDirScope }: TagParams): GuardTag => {
  if (mounts.length !== 1) {
    return 'projects-scope';
  }
  return isSessionDirScope ? 'session-directory-scope' : 'worktree-scope';
};

type HeadParams = {
  readonly tag: GuardTag;
  readonly workingDir: string;
  readonly mounts: ReadonlyArray<SessionProjectMount>;
};

const headLines = ({ tag, workingDir, mounts }: HeadParams): ReadonlyArray<string> => {
  if (tag === 'worktree-scope') {
    return [`You are operating inside an isolated git worktree at: ${workingDir}`];
  }
  if (tag === 'session-directory-scope') {
    return [`You are operating inside this session directory: ${workingDir}`];
  }
  if (mounts.length === 0) {
    return [
      `You are operating from an ephemeral scratch directory at: ${workingDir}`,
      'This session has no materialized project mounts yet. Nothing you put in the scratch directory is kept.',
    ];
  }
  return [
    `You are operating inside the active project mount at: ${workingDir}`,
    `This session has ${mounts.length} materialized project mounts:`,
    ...mounts.map(
      (mount) =>
        `- ${mount.mountName} at ${mount.worktreePath}${mount.branch === '' ? '' : ` (branch ${mount.branch})`}`,
    ),
    'Each mount is a separate git repository on its own branch. Run git commands inside the relevant mount.',
  ];
};

type StrictParams = {
  readonly tag: GuardTag;
};

const strictBoundaryLines = ({ tag }: StrictParams): ReadonlyArray<string> => {
  if (tag === 'worktree-scope') {
    return STRICT_WORKTREE_LINES;
  }
  if (tag === 'projects-scope') {
    return [
      'ALL file operations MUST resolve inside one of these mounts. Do NOT create files outside them.',
    ];
  }
  return STRICT_DIR_LINES;
};

export const buildScopeGuard = ({
  workingDir,
  projects,
  mounts,
  isBridgeServing,
  isSessionDirScope,
  canWrite,
}: ScopeGuardParams): string => {
  const unmounted = projects.filter(
    (project) => !mounts.some((mount) => mount.projectId === project.id),
  );
  const tag = guardTag({ mounts, isSessionDirScope });
  const mountedLines =
    tag === 'projects-scope'
      ? []
      : projects
          .filter((project) => mounts.some((mount) => mount.projectId === project.id))
          .map((project) => projectLine({ project, mounts }));
  const teachingLines =
    unmounted.length > 0
      ? [
          'This session belongs to a workspace with these projects:',
          ...projects.map((project) => projectLine({ project, mounts })),
          'You may READ the project root paths listed above.',
          WRITE_BOUNDARY_LINE,
          ...(canWrite ? [...MOUNT_RULE_LINES, materializeLine({ isBridgeServing })] : []),
        ]
      : [...mountedLines, ...strictBoundaryLines({ tag })];
  const mountCommands = canWrite ? mountCommandLines({ isBridgeServing, mounts }) : [];
  return [
    `[${tag}]`,
    ...headLines({ tag, workingDir, mounts }),
    ...teachingLines,
    ...mountCommands,
    `[/${tag}]`,
  ].join('\n');
};
