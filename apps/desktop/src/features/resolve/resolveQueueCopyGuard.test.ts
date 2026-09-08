import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD_FILE_NAME = 'resolveQueueCopyGuard.test.ts';

const FORBIDDEN_STRINGS: ReadonlyArray<string> = [
  'Needs decision',
  'Needs answer',
  'Accepted, not yet delivered',
  'Confirm group',
  'Acceptance cleared',
  'Accept group',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const collectSourceFiles = ({ root }: { readonly root: string }): ReadonlyArray<string> => {
  const files: Array<string> = [];
  const walk = ({ dir }: { readonly dir: string }): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        walk({ dir: full });
        continue;
      }
      if (entry === GUARD_FILE_NAME) {
        continue;
      }
      const dot = entry.lastIndexOf('.');
      const ext = dot === -1 ? '' : entry.slice(dot);
      if (SOURCE_EXTENSIONS.has(ext)) {
        files.push(full);
      }
    }
  };
  walk({ dir: root });
  return files;
};

describe('resolve queue copy guard', () => {
  it('never reintroduces the legacy wizard copy in the resolve or review feature folders', () => {
    const roots = [HERE, join(HERE, '..', 'review')];
    const offenders: Array<string> = [];
    for (const root of roots) {
      for (const file of collectSourceFiles({ root })) {
        const contents = readFileSync(file, 'utf8');
        for (const forbidden of FORBIDDEN_STRINGS) {
          if (contents.includes(forbidden)) {
            offenders.push(`${file}: "${forbidden}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
