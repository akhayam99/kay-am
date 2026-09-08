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

const FORBIDDEN_WORDS: ReadonlyArray<string> = ['deliver', 'manifest', 'expected head', 'receipt'];

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

const LITERAL = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g;

const prose = ({ contents }: { readonly contents: string }): ReadonlyArray<string> => {
  const body = contents
    .split('\n')
    .filter(
      (line) => !/^\s*(?:import|export)\b.*\bfrom\b/.test(line) && !/^\s*import\s*\(/.test(line),
    )
    .join('\n');
  return [...body.matchAll(LITERAL)].flatMap((match) => {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    return value.trim() === '' || !/\s/.test(value.trim()) ? [] : [value];
  });
};

describe('resolve queue copy guard', () => {
  const roots = [HERE, join(HERE, '..', 'review')];

  it('never reintroduces the legacy wizard copy in the resolve or review feature folders', () => {
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

  it('reads the sentences it is meant to guard', () => {
    const sentences = prose({
      contents: readFileSync(join(HERE, 'resolvePublishCopy.ts'), 'utf8'),
    });
    expect(sentences).toContain('Update branch and review again');
    expect(sentences).toContain('The branch carries a commit you did not approve');
  });

  it('keeps the engineering vocabulary out of every sentence a user reads', () => {
    const offenders: Array<string> = [];
    for (const root of roots) {
      for (const file of collectSourceFiles({ root })) {
        if (file.includes('.test.')) {
          continue;
        }
        for (const sentence of prose({ contents: readFileSync(file, 'utf8') })) {
          for (const word of FORBIDDEN_WORDS) {
            if (sentence.toLowerCase().includes(word)) {
              offenders.push(`${file}: "${sentence}"`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
