import type { Tone } from '@goodboy/ui';
import type { ResolveQueueStatus } from '../../../../store/slices/resolve/deriveResolveQueueStatus';

export const BADGE_TONE_BY_STATUS: Record<ResolveQueueStatus, Tone> = {
  for_you: 'neutral',
  agent_asked: 'warning',
  working: 'info',
  ready_to_push: 'success',
  pushed: 'neutral',
  later: 'neutral',
  changed_since_accepted: 'warning',
  delivery_failed: 'danger',
  confirm_delivery: 'warning',
  wont_fix: 'neutral',
  wont_fix_sent: 'neutral',
};
