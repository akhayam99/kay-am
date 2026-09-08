import type { ResolveThread } from '@goodboy/types';

export const isLocalNoteThread = ({ row }: { readonly row: ResolveThread }): boolean =>
  row.originKind === 'diff_comment';
