import { Square } from 'lucide-react';
import type { BranchCommit, OpenQuestion } from '@goodboy/types';
import { Divider, InlineConfirm, PANE_RHYTHM, ScrollFade, cn } from '@goodboy/ui';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import type { ConversationVerb } from '../../../conversationPresentation';
import { decodeStateReason } from '../../../stateReason';
import type { Conversation } from '../../../selectConversations';
import { ChangesSection } from './ChangesSection';
import { ConversationSection } from './ConversationSection';
import { DetailHeader } from './DetailHeader';
import { InstructionsSection } from './InstructionsSection';
import { PublicationSection } from './PublicationSection';
import { QuestionSection } from './QuestionSection';
import { ReplySection } from './ReplySection';
import { WorkSection } from './WorkSection';

type Sibling = { readonly threadId: string; readonly title: string };

export type StopConfirm = {
  readonly threadCount: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

type Props = {
  readonly conversation: Conversation;
  readonly question: OpenQuestion | null;
  readonly commits: ReadonlyArray<BranchCommit>;
  readonly missingShas: ReadonlyArray<string>;
  readonly files: ReadonlyArray<string>;
  readonly alsoAddresses: ReadonlyArray<string>;
  readonly worktreePath: string | null;
  readonly siblings: ReadonlyArray<Sibling>;
  readonly costUsd: number | null;
  readonly instructions: string;
  readonly isPrimaryDisabled: boolean;
  readonly primaryDisabledReason?: string;
  readonly stopConfirm: StopConfirm | null;
  readonly onBack: (() => void) | null;
  readonly onAct: (verb: ConversationVerb) => void;
  readonly onOpenThread: () => void;
  readonly onOpenCommit: (sha: string) => void;
  readonly onSaveReply: (params: { readonly threadId: string; readonly reply: string }) => void;
  readonly onChangeInstructions: (params: {
    readonly threadId: string;
    readonly value: string;
  }) => void;
  readonly onSendAnswer: (params: {
    readonly question: OpenQuestion;
    readonly answer: string;
  }) => void;
  readonly onViewWork: () => void;
  readonly onSelectSibling: (threadId: string) => void;
};

export const ConversationDetail = ({
  conversation,
  question,
  commits,
  missingShas,
  files,
  alsoAddresses,
  worktreePath,
  siblings,
  costUsd,
  instructions,
  isPrimaryDisabled,
  primaryDisabledReason,
  stopConfirm,
  onBack,
  onAct,
  onOpenThread,
  onOpenCommit,
  onSaveReply,
  onChangeInstructions,
  onSendAnswer,
  onViewWork,
  onSelectSibling,
}: Props) => {
  const { presentation, row, attempt, threadId } = conversation;
  const decoded = decodeStateReason({ stateReason: row?.stateReason ?? null });
  const isResolved = presentation.badge === 'resolved';
  const isQuestion = presentation.primary === 'answer';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DetailHeader
        conversation={conversation}
        isPrimaryDisabled={isPrimaryDisabled}
        {...(primaryDisabledReason !== undefined && { primaryDisabledReason })}
        onBack={onBack}
        onAct={onAct}
        onOpenThread={onOpenThread}
      />
      <Divider />
      <ScrollFade className="min-h-0 flex-1">
        <div className={cn('flex flex-col gap-6', PANE_RHYTHM.body, PANE_RHYTHM.measure.reading)}>
          {stopConfirm !== null && (
            <InlineConfirm
              role="alert"
              icon={<Square size={ICON_SIZE.control} aria-hidden />}
              title={
                stopConfirm.threadCount === 1
                  ? 'Stop work on this conversation?'
                  : `Stop work on ${stopConfirm.threadCount} conversations?`
              }
              confirmLabel="Stop"
              cancelLabel="Keep going"
              onConfirm={stopConfirm.onConfirm}
              onCancel={stopConfirm.onCancel}
            />
          )}
          {isQuestion && (
            <QuestionSection
              question={question}
              fallbackText={row?.question ?? null}
              onSend={onSendAnswer}
            />
          )}
          <ConversationSection head={conversation.head} replies={conversation.replies} />
          <ReplySection
            threadId={threadId}
            reply={row?.replyDraft ?? null}
            isClosingReason={row?.disposition === 'no_change'}
            isReadOnly={isResolved || presentation.isRunning}
            onSave={onSaveReply}
          />
          <ChangesSection
            commits={commits}
            missingShas={missingShas}
            files={files}
            worktreePath={worktreePath}
            alsoAddresses={alsoAddresses}
            onOpenCommit={onOpenCommit}
            onViewChanges={() => onAct('view_changes')}
          />
          {!isResolved && (
            <InstructionsSection
              threadId={threadId}
              value={instructions}
              onChange={onChangeInstructions}
            />
          )}
          <PublicationSection
            error={decoded.publicationError}
            hasPostedReply={row?.replyPostedAt !== null && row?.replyPostedAt !== undefined}
            isPublishing={row?.state === 'publishing'}
            onRetryPublish={() => onAct('retry_publish')}
            onReviewOnGithub={() => onAct('view_on_github')}
          />
          {attempt !== null && (
            <WorkSection
              attempt={attempt}
              siblings={siblings}
              costUsd={costUsd}
              onViewWork={onViewWork}
              onSelectSibling={onSelectSibling}
            />
          )}
        </div>
      </ScrollFade>
    </div>
  );
};
