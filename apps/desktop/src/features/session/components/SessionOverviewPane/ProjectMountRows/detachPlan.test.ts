import { describe, expect, it } from 'vitest';
import type { WorktreeDetachAssessment } from '@goodboy/types';
import {
  buildDetachPlan,
  detachActionFor,
  detachOutcomeMessage,
  summarizeDetachOutcomes,
} from './detachPlan';

const plan = ({
  assessment,
  isRepoProject = true,
  isBlocked = false,
  branch = 'ak/feat',
}: {
  readonly assessment: WorktreeDetachAssessment | null;
  readonly isRepoProject?: boolean;
  readonly isBlocked?: boolean;
  readonly branch?: string;
}) =>
  buildDetachPlan({
    projectName: 'api',
    worktreePath: '/worktrees/api',
    branch,
    isRepoProject,
    isBlocked,
    assessment,
  });

const assessed = ({
  affectedFiles,
  localOnlyCommits,
  hasUpstream,
  branch = 'ak/feat',
}: {
  readonly affectedFiles: number;
  readonly localOnlyCommits: number;
  readonly hasUpstream: boolean;
  readonly branch?: string | null;
}): WorktreeDetachAssessment => ({
  kind: 'assessed',
  path: '/worktrees/api',
  branch,
  hasUpstream,
  affectedFiles,
  localOnlyCommits,
});

describe('buildDetachPlan', () => {
  it('waits for the assessment before proposing any disposition', () => {
    expect(plan({ assessment: null })).toEqual({ kind: 'checking' });
    expect(detachActionFor({ plan: { kind: 'checking' } })).toBeNull();
  });

  it('keeps a folder project ahead of every other row', () => {
    const result = plan({ assessment: null, isRepoProject: false });

    expect(result).toEqual({
      kind: 'keep',
      reason: 'folder',
      sentence: 'Detach api from this session; its folder at /worktrees/api will stay on disk.',
    });
  });

  it('uses singular wording for a single file and a single commit', () => {
    const result = plan({
      assessment: assessed({ affectedFiles: 1, localOnlyCommits: 1, hasUpstream: true }),
    });

    expect(result).toMatchObject({
      kind: 'risky',
      lines: [
        'Remove /worktrees/api for ak/feat; it has 1 uncommitted file and 1 unpushed commit.',
        '1 uncommitted file at /worktrees/api will be deleted.',
        'The branch and its commits stay in the repository.',
      ],
      details: ['Files affected (1)', 'Unpushed commits (1)'],
    });
  });

  it('shows the zero commit count when only files are at risk', () => {
    const result = plan({
      assessment: assessed({ affectedFiles: 2, localOnlyCommits: 0, hasUpstream: true }),
    });

    expect(result).toMatchObject({
      lines: [
        'Remove /worktrees/api for ak/feat; it has 2 uncommitted files and 0 unpushed commits.',
        '2 uncommitted files at /worktrees/api will be deleted.',
        'The branch and its commits stay in the repository.',
      ],
    });
  });

  it('names local-only commits and omits the deletion line when nothing is uncommitted', () => {
    const result = plan({
      assessment: assessed({ affectedFiles: 0, localOnlyCommits: 3, hasUpstream: false }),
    });

    expect(result).toMatchObject({
      lines: [
        'Remove /worktrees/api for ak/feat, which has no upstream; it has 0 uncommitted files and 3 local-only commits.',
        'The branch and its commits stay in the repository.',
      ],
      details: ['Files affected (0)', 'Local-only commits (3)'],
    });
  });

  it('falls back to the mounted branch name when the assessment has none', () => {
    const result = plan({
      assessment: { kind: 'unavailable', path: '/worktrees/api', branch: null },
    });

    expect(result).toEqual({
      kind: 'keep',
      reason: 'unavailable',
      sentence:
        'The safety of ak/feat at /worktrees/api could not be verified; detach will keep the directory.',
    });
  });

  it('never proposes removal while another writer holds the worktree', () => {
    const result = plan({
      assessment: assessed({ affectedFiles: 0, localOnlyCommits: 0, hasUpstream: true }),
      isBlocked: true,
    });

    expect(result).toMatchObject({ kind: 'keep', reason: 'blocked' });
    expect(detachActionFor({ plan: result })).toMatchObject({ disposition: 'keep-files' });
  });
});

describe('detach outcomes', () => {
  it('reports the worst outcome of the mounts it touched', () => {
    expect(summarizeDetachOutcomes({ outcomes: [{ kind: 'removed' }, { kind: 'failed' }] })).toBe(
      'failed',
    );
    expect(summarizeDetachOutcomes({ outcomes: [{ kind: 'removed' }, { kind: 'kept' }] })).toBe(
      'kept',
    );
    expect(summarizeDetachOutcomes({ outcomes: [{ kind: 'removed' }] })).toBe('removed');
  });

  it('reports the returned disposition rather than the predicted one', () => {
    expect(
      detachOutcomeMessage({ kind: 'kept', projectName: 'api', worktreePath: '/worktrees/api' }),
    ).toBe('Detached api. Files remain at /worktrees/api.');
    expect(
      detachOutcomeMessage({ kind: 'failed', projectName: 'api', worktreePath: '/worktrees/api' }),
    ).toBe(
      'Could not finish removing the worktree. The mount is retained; check again before retrying.',
    );
  });
});
