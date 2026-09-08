import type { ResolveAttempt } from '@goodboy/types';

const LIVE_PHASES: ReadonlyArray<ResolveAttempt['phase']> = ['queued', 'running', 'waiting'];

export const hasActiveResolveRun = ({
  attempts,
}: {
  readonly attempts: ReadonlyArray<ResolveAttempt>;
}): boolean => attempts.some((attempt) => LIVE_PHASES.includes(attempt.phase));
