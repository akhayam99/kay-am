import type { SessionExternalTask } from '@goodboy/types';

type Params = {
  readonly tasks: ReadonlyArray<SessionExternalTask>;
  readonly branch: string | null;
  readonly body: string;
};

export const partOfReferences = ({ tasks, branch, body }: Params): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  for (const task of tasks) {
    const taskBranch = task.branch ?? null;
    if (taskBranch !== null && branch !== null && taskBranch !== branch) {
      continue;
    }
    const identifier = task.identifier.trim();
    if (identifier === '') {
      continue;
    }
    const line = `Part of ${identifier}`;
    if (lines.includes(line) || body.includes(identifier)) {
      continue;
    }
    lines.push(line);
  }
  return lines;
};
