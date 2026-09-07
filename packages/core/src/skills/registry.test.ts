import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { IsoDateTime, WorkspaceId } from '@goodboy/types';
import {
  migrate,
  insertWorkspace,
  listSkillsForWorkspace,
  type Database as DbInterface,
} from '@goodboy/db';
import type { SkillFs } from './registry';
import { SkillRegistry, SkillRegistryError } from './registry';

const WORKSPACE_ID = 'ws_test' as WorkspaceId;
const ROOT = '/fake/root';
const SKILLS_DIR = `${ROOT}/.kay/skills`;
const CLAUDE_SKILLS_DIR = `${ROOT}/.claude/skills`;

const FIXED_NOW = '2024-01-01T00:00:00.000Z' as IsoDateTime;

function makeNow(): () => IsoDateTime {
  return () => FIXED_NOW;
}

function makeDb(): DbInterface {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return {
    async exec(sql: string) {
      db.exec(sql);
    },
    async execute(sql: string, params: ReadonlyArray<unknown> = []) {
      const stmt = db.prepare(sql);
      const result = stmt.run(...(params as ReadonlyArray<never>));
      return { rowsAffected: result.changes };
    },
    async select<T>(sql: string, params: ReadonlyArray<unknown> = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...(params as ReadonlyArray<never>)) as unknown as ReadonlyArray<T>;
    },
  };
}

async function makeSeededDb(): Promise<DbInterface> {
  const db = makeDb();
  await migrate(db);
  await insertWorkspace({
    db,
    workspace: {
      id: WORKSPACE_ID,
      name: 'test',
      slug: 'test',
      sessionsRoot: ROOT,
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
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  });
  return db;
}

function makeFs(files: Record<string, string>): SkillFs {
  return {
    async readDir(path: string): Promise<string[]> {
      if (path === SKILLS_DIR) {
        return Object.keys(files)
          .filter((f) => f.startsWith(`${SKILLS_DIR}/`))
          .map((f) => f.slice(`${SKILLS_DIR}/`.length));
      }
      if (path === CLAUDE_SKILLS_DIR) {
        const subdirs = new Set<string>();
        for (const f of Object.keys(files)) {
          if (f.startsWith(`${path}/`)) {
            const rel = f.slice(`${path}/`.length);
            const firstSegment = rel.split('/')[0];
            if (firstSegment !== undefined) {
              subdirs.add(firstSegment);
            }
          }
        }
        return [...subdirs];
      }
      return [];
    },
    async readFile(path: string): Promise<string> {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`file not found: ${path}`);
      }
      return content;
    },
    async stat(path: string): Promise<{ exists: boolean }> {
      if (files[path] !== undefined) {
        return { exists: true };
      }
      const hasFiles = Object.keys(files).some((f) => f.startsWith(`${path}/`));
      return { exists: hasFiles };
    },
  };
}

const SKILL_A = `---
name: skill-a
description: First skill
---

Body of skill A.
`;

const SKILL_B = `---
name: skill-b
description: Second skill
---

Body of skill B.
`;

const MALFORMED = `no frontmatter here`;

describe('SkillRegistry.scanWorkspace', () => {
  it('happy path: 2 .md files → both parsed and upserted', async () => {
    const db = await makeSeededDb();
    const fs = makeFs({
      [`${SKILLS_DIR}/skill-a.md`]: SKILL_A,
      [`${SKILLS_DIR}/skill-b.md`]: SKILL_B,
    });
    const registry = new SkillRegistry({ fs, now: makeNow() });

    const result = await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);

    expect(result).toHaveLength(2);
    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(['skill-a', 'skill-b']);

    const inDb = await listSkillsForWorkspace(db, WORKSPACE_ID);
    expect(inDb).toHaveLength(2);
  });

  it('file removed → next scan deletes db row', async () => {
    const db = await makeSeededDb();
    const fsFirst = makeFs({
      [`${SKILLS_DIR}/skill-a.md`]: SKILL_A,
      [`${SKILLS_DIR}/skill-b.md`]: SKILL_B,
    });
    const registry = new SkillRegistry({ fs: fsFirst, now: makeNow() });
    await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);

    const fsSecond = makeFs({
      [`${SKILLS_DIR}/skill-a.md`]: SKILL_A,
    });
    const registry2 = new SkillRegistry({ fs: fsSecond, now: makeNow() });
    const result = await registry2.scanWorkspace(WORKSPACE_ID, ROOT, db);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('skill-a');

    const inDb = await listSkillsForWorkspace(db, WORKSPACE_ID);
    expect(inDb).toHaveLength(1);
    expect(inDb[0]?.name).toBe('skill-a');
  });

  it('malformed file → SkillRegistryError surfaced', async () => {
    const db = await makeSeededDb();
    const fs = makeFs({
      [`${SKILLS_DIR}/bad.md`]: MALFORMED,
    });
    const registry = new SkillRegistry({ fs, now: makeNow() });

    await expect(registry.scanWorkspace(WORKSPACE_ID, ROOT, db)).rejects.toThrow(
      SkillRegistryError,
    );
  });

  it('empty / missing skills dir → returns empty array', async () => {
    const db = await makeSeededDb();
    const fsMissing: SkillFs = {
      async readDir(): Promise<string[]> {
        return [];
      },
      async readFile(path: string): Promise<string> {
        throw new Error(`not found: ${path}`);
      },
      async stat(): Promise<{ exists: boolean }> {
        return { exists: false };
      },
    };

    const registry = new SkillRegistry({ fs: fsMissing, now: makeNow() });
    const result = await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);

    expect(result).toHaveLength(0);
    const inDb = await listSkillsForWorkspace(db, WORKSPACE_ID);
    expect(inDb).toHaveLength(0);
  });
});

describe('SkillRegistry.listSkills', () => {
  it('returns skills from db for workspace', async () => {
    const db = await makeSeededDb();
    const fs = makeFs({
      [`${SKILLS_DIR}/skill-a.md`]: SKILL_A,
    });
    const registry = new SkillRegistry({ fs, now: makeNow() });
    await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);

    const list = await registry.listSkills(WORKSPACE_ID, db);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('skill-a');
  });
});

describe('SkillRegistry.getSkillByName', () => {
  it('returns skill when found', async () => {
    const db = await makeSeededDb();
    const fs = makeFs({
      [`${SKILLS_DIR}/skill-a.md`]: SKILL_A,
    });
    const registry = new SkillRegistry({ fs, now: makeNow() });
    await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);

    const skill = await registry.getSkillByName(WORKSPACE_ID, 'skill-a', db);
    expect(skill).not.toBeNull();
    expect(skill?.name).toBe('skill-a');
  });

  it('returns null for unknown name', async () => {
    const db = await makeSeededDb();
    const registry = new SkillRegistry({ fs: makeFs({}), now: makeNow() });

    const skill = await registry.getSkillByName(WORKSPACE_ID, 'nonexistent', db);
    expect(skill).toBeNull();
  });
});

describe('SkillRegistry.scanWorkspace – Claude Code convention (.claude/skills)', () => {
  const CLAUDE_SKILL_BAR = `---
name: bar
description: Claude Code skill bar
---

Body of bar.
`;

  it('discovers skill from .claude/skills/<name>/SKILL.md', async () => {
    const db = await makeSeededDb();
    const fs = makeFs({
      [`${CLAUDE_SKILLS_DIR}/bar/SKILL.md`]: CLAUDE_SKILL_BAR,
    });
    const registry = new SkillRegistry({ fs, now: makeNow() });

    const result = await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('bar');
    expect(result[0]?.filePath).toBe(`${CLAUDE_SKILLS_DIR}/bar/SKILL.md`);
  });

  it('discovers skills from BOTH .kay/skills and .claude/skills simultaneously', async () => {
    const db = await makeSeededDb();
    const fs = makeFs({
      [`${SKILLS_DIR}/skill-a.md`]: SKILL_A,
      [`${CLAUDE_SKILLS_DIR}/bar/SKILL.md`]: CLAUDE_SKILL_BAR,
    });
    const registry = new SkillRegistry({ fs, now: makeNow() });

    const result = await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);

    expect(result).toHaveLength(2);
    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(['bar', 'skill-a']);
  });

  it('ignores .claude/skills subdirs with no SKILL.md', async () => {
    const db = await makeSeededDb();
    const fs = makeFs({
      [`${CLAUDE_SKILLS_DIR}/bar/SKILL.md`]: CLAUDE_SKILL_BAR,
      [`${CLAUDE_SKILLS_DIR}/empty-dir/other.md`]: '# not a skill',
    });
    const registry = new SkillRegistry({ fs, now: makeNow() });

    const result = await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('bar');
  });

  it('missing .claude/skills dir → returns empty (no throw)', async () => {
    const db = await makeSeededDb();
    const fs = makeFs({});
    const registry = new SkillRegistry({ fs, now: makeNow() });

    const result = await registry.scanWorkspace(WORKSPACE_ID, ROOT, db);
    expect(result).toHaveLength(0);
  });
});
