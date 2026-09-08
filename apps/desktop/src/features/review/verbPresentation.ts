import {
  Activity,
  CircleSlash,
  ExternalLink,
  FileDiff,
  GitCommit,
  MessageCircleQuestion,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  ScanSearch,
  Split,
  Square,
  Upload,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ConversationVerb } from './conversationPresentation';

export const VERB_ICON: Record<ConversationVerb, LucideIcon> = {
  fix: Wrench,
  fix_separately: Split,
  answer: MessageCircleQuestion,
  retry: RotateCcw,
  retry_publish: RotateCcw,
  recheck_fix: ScanSearch,
  review_changes: FileDiff,
  publish: Upload,
  edit_reply: Pencil,
  write_reply: MessageSquarePlus,
  view_work: Activity,
  view_progress: Activity,
  view_changes: GitCommit,
  view_on_github: ExternalLink,
  cancel_run: CircleSlash,
  stop_run: Square,
};

const MINUTE = 60_000;
const HOUR = 3_600_000;

export const formatElapsed = ({
  fromMs,
  nowMs,
}: {
  readonly fromMs: number;
  readonly nowMs: number;
}): string => {
  const span = Math.max(0, nowMs - fromMs);
  if (span < MINUTE) {
    return `${Math.floor(span / 1000)}s`;
  }
  if (span < HOUR) {
    return `${Math.floor(span / MINUTE)}m`;
  }
  return `${Math.floor(span / HOUR)}h ${Math.floor((span % HOUR) / MINUTE)}m`;
};

export const siblingSentence = ({
  titles,
}: {
  readonly titles: ReadonlyArray<string>;
}): string | null => {
  if (titles.length === 0) {
    return null;
  }
  if (titles.length === 1) {
    return `with ${titles[0]}`;
  }
  return `with ${titles.length} others`;
};
