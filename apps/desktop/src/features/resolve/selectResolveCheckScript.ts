import type { ScriptGroup } from '../scripts/scripts';

export type ResolveCheckScript = {
  readonly name: string;
  readonly command: string;
  readonly relDir: string;
};

const CHECK_SCRIPT_NAME = 'test';

type Params = { readonly groups: ReadonlyArray<ScriptGroup> };

export const selectResolveCheckScript = ({ groups }: Params): ResolveCheckScript | null => {
  for (const group of groups.filter((candidate) => candidate.relDir === '')) {
    const script = group.scripts.find((candidate) => candidate.name === CHECK_SCRIPT_NAME);
    if (script !== undefined) {
      return { name: script.name, command: script.command, relDir: group.relDir };
    }
  }
  return null;
};
