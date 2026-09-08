export const MOCK_ENABLED =
  import.meta.env.VITE_GOODBOY_MOCK === '1' && import.meta.env.MODE !== 'test';

const MOCK_MOUNT_DIFF_STATS = new Map([
  ['/mock/northwind/api', { additions: 148, deletions: 37 }],
  ['/mock/northwind/app-web', { additions: 286, deletions: 64 }],
  ['/mock/northwind/website', { additions: 73, deletions: 19 }],
  ['/mock/northwind/workflow/api', { additions: 120, deletions: 18 }],
  ['/mock/northwind/workflow/app-web', { additions: 64, deletions: 9 }],
  ['/mock/harborline/ledger-core-rounding', { additions: 312, deletions: 148 }],
  ['/mock/harborline/ledger-core-postings', { additions: 187, deletions: 42 }],
  ['/mock/harborline/ledger-core-backfill', { additions: 96, deletions: 23 }],
  ['/mock/harborline/notify-relay-backoff', { additions: 74, deletions: 31 }],
]);

export const readMockMountDiffStat = (worktreePath: string) =>
  MOCK_ENABLED ? (MOCK_MOUNT_DIFF_STATS.get(worktreePath) ?? null) : null;
