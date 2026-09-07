export type { SetFn, GetFn } from '../../slice-types';

export type SendTurnResult = Readonly<{
  blockedOverBudget: boolean;
  isWriterLeaseDenied?: boolean;
}>;
