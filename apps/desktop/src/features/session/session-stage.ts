import { Eye, Hammer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Tone } from '@goodboy/ui';
import type { SessionAttentionReason, SessionStage } from '@goodboy/types';
import { CONCEPT_ICONS } from '../../shared/components/conceptIcons';

type AttentionEntry = {
  readonly icon: keyof typeof CONCEPT_ICONS;
  readonly tone: Tone;
};

export const ATTENTION_REASON_META: Record<SessionAttentionReason, AttentionEntry> = {
  'agent-error': { icon: 'errors', tone: 'danger' },
  'open-question': { icon: 'questions', tone: 'warning' },
  'unread-reply': { icon: 'agents', tone: 'primary' },
  'ci-failed': { icon: 'checks', tone: 'danger' },
  'changes-requested': { icon: 'review', tone: 'danger' },
  'pr-approved': { icon: 'pr', tone: 'success' },
};

type SessionStageEntry = {
  readonly label: string;
};

export const SESSION_STAGE_META: Record<SessionStage, SessionStageEntry> = {
  attention: {
    label: 'needs you',
  },
  running: {
    label: 'running',
  },
  review: {
    label: 'in review',
  },
  building: {
    label: 'building',
  },
  done: {
    label: 'done',
  },
};

export const SESSION_STAGE_ICON: Record<SessionStage, LucideIcon> = {
  attention: CONCEPT_ICONS.questions,
  running: CONCEPT_ICONS.sessions,
  review: Eye,
  building: Hammer,
  done: CONCEPT_ICONS.runDone,
};

export const STAGE_TONE: Record<SessionStage, Tone> = {
  attention: 'warning',
  running: 'info',
  review: 'success',
  building: 'neutral',
  done: 'merged',
};
