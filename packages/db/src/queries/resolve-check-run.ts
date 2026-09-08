import type { ResolveCheckRun, SessionId } from '@goodboy/types';
import type { Database } from '../client';
import { resolveStringArray } from './resolve-json';

type Row = Omit<ResolveCheckRun, 'acceptedSet'> & { readonly acceptedSet: string };
type InsertParams = { readonly db: Database; readonly run: ResolveCheckRun };
type SessionParams = { readonly db: Database; readonly sessionId: SessionId };
type CandidateParams = { readonly db: Database; readonly candidateId: string };

const COLUMNS = `id, session_id AS sessionId, candidate_id AS candidateId, command,
  test_identity AS testIdentity, breadth, base_tree AS baseTree,
  candidate_tree AS candidateTree, accepted_set AS acceptedSet, outcome,
  exit_code AS exitCode, duration_ms AS durationMs, log_ref AS logRef,
  created_at AS createdAt`;

const hydrate = ({ row }: { readonly row: Row }): ResolveCheckRun => ({
  ...row,
  acceptedSet: resolveStringArray({ json: row.acceptedSet }),
});

export const insertResolveCheckRun = async ({ db, run }: InsertParams): Promise<void> => {
  await db.execute(
    `INSERT INTO resolve_check_runs (id, session_id, candidate_id, command, test_identity, breadth, base_tree, candidate_tree, accepted_set, outcome, exit_code, duration_ms, log_ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      run.sessionId,
      run.candidateId,
      run.command,
      run.testIdentity,
      run.breadth,
      run.baseTree,
      run.candidateTree,
      JSON.stringify([...run.acceptedSet]),
      run.outcome,
      run.exitCode,
      run.durationMs,
      run.logRef,
      run.createdAt,
    ],
  );
};

export const listResolveCheckRuns = async ({
  db,
  sessionId,
}: SessionParams): Promise<ReadonlyArray<ResolveCheckRun>> => {
  const rows = await db.select<Row>(
    `SELECT ${COLUMNS} FROM resolve_check_runs WHERE session_id = ? ORDER BY created_at, id`,
    [sessionId],
  );
  return rows.map((row) => hydrate({ row }));
};

export const listResolveCheckRunsForCandidate = async ({
  db,
  candidateId,
}: CandidateParams): Promise<ReadonlyArray<ResolveCheckRun>> => {
  const rows = await db.select<Row>(
    `SELECT ${COLUMNS} FROM resolve_check_runs WHERE candidate_id = ? ORDER BY created_at, id`,
    [candidateId],
  );
  return rows.map((row) => hydrate({ row }));
};
