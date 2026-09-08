import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REVIEW_ROOT = join(import.meta.dirname, '..', 'features', 'review');
const RESOLVE_ROOT = join(import.meta.dirname, '..', 'store', 'slices', 'resolve');
const EM_DASH = '—';
const BATCH_VOCABULARY =
  /\b(batch|batches|batched|queue|queued|queueing|scheduler|scheduled|scheduling)\b/i;

const sourceFiles = ({ root }: { readonly root: string }): ReadonlyArray<string> =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles({ root: path });
    }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) {
      return [];
    }
    if (entry.name.includes('.test.')) {
      return [];
    }
    return [path];
  });

const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

const literalsOf = ({ source }: { readonly source: string }): ReadonlyArray<string> =>
  [...source.matchAll(STRING_LITERAL)].map((match) => match[2] ?? '');

const isProse = ({ literal }: { readonly literal: string }): boolean =>
  /\s/.test(literal.trim()) && /[a-z]/.test(literal);

describe('review copy', () => {
  it('carries no em dash in any string the reader can see', () => {
    const offenders = sourceFiles({ root: REVIEW_ROOT })
      .filter((path) => readFileSync(path, 'utf8').includes(EM_DASH))
      .map((path) => path.replace(REVIEW_ROOT, 'features/review'));

    expect(offenders).toEqual([]);
  });

  it('never calls a publication a batch, a queue, or a schedule', () => {
    const offenders = [
      ...sourceFiles({ root: REVIEW_ROOT }),
      ...sourceFiles({ root: RESOLVE_ROOT }),
    ].flatMap((path) =>
      literalsOf({ source: readFileSync(path, 'utf8') })
        .filter((literal) => isProse({ literal }) && BATCH_VOCABULARY.test(literal))
        .map((literal) => `${path}: ${literal}`),
    );

    expect(offenders).toEqual([]);
  });
});
