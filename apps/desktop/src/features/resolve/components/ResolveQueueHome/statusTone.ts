import type { Tone } from '@goodboy/ui';
import type { ResolveQueueStatus } from '../../../../store/slices/resolve/deriveResolveQueueStatus';

export const BADGE_TONE_BY_STATUS: Record<ResolveQueueStatus, Tone> = {
  for_you: 'warning',
  agent_asked: 'warning',
  working: 'info',
  ready_to_push: 'success',
  pushed: 'merged',
  later: 'neutral',
  wont_fix: 'neutral',
  wont_fix_sent: 'merged',
  changed_since_accepted: 'warning',
};
