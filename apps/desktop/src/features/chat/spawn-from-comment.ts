import type { AgentSourceKind, PrComment, ProviderId, PullRequestState } from '@goodboy/types';
import type { AgentKind } from '../session/agent-kind';
import type { CommentThread } from '../github/comment-threads';
import { prCommentLocation } from '../session/pr-comment-location';
import { RESOLVER_KICKOFF_LABELS } from './utils/resolverKickoffLabels';
import type { EffortLevel } from './utils/chat-constants';

const TITLE_MAX = 60;

const REPLY_CONTRACT: ReadonlyArray<string> = [
  'Every <<comment-reply>> block follows this contract.',
  'Goodboy wraps your block in a fixed structure when it posts: a verdict label ("Valid." for a fix, "Not applying." for a close) opens the first paragraph, and a "Resolution." paragraph naming the commit or the closing reason is appended below. Write only what goes between them.',
  'So never state the outcome and never name the commit sha: no "Fixed in `abc1234`.", no "Not applying this one.", no "Resolved in", no closing sentence. Both would read twice.',
  'Write the reason, in GitHub-flavored markdown addressed to the reviewer: what was actually wrong, or why the change is not the right one.',
  'Two to four sentences, or two to four `-` bullets when there is more than one independent point, one claim per bullet. One sentence is enough when the cause is obvious.',
  'Put identifiers, paths, symbols and commit shas in backticks. No headings, no bold runs, no block quotes, no nested lists, no tables.',
  'Stay under 40 words on a straightforward thread. Never go past 120 words, and only get near it when the reasoning genuinely matters.',
  'Summarize a long enumeration with a count instead of listing it, as in "about 50 other routes follow the same convention".',
  "Past tense for what you did, present tense for what is true of the code. No praise openers, no apologies, no hedging, no restating the reviewer's own words.",
  'Leave out the investigation narrative and the list of everything you checked.',
  'A good reply reads like this:',
  '',
  '- `apps/web/src/routes/` uses camelCase folders that mirror the URL slug.',
  '- Renaming this one alone would break the convention in about 50 sibling routes.',
];

const EXAMPLE_SHA = 'a1b2c3d';

const EXAMPLE_REPLIES: ReadonlyArray<string> = [
  'The lookup ran before the guard, so an empty batch reached `resolveOne` and threw. The guard now returns early.',
  '`apps/web/src/routes/` uses camelCase folders that mirror the URL slug, so renaming this one alone would break about 50 siblings.',
];

const EXAMPLE_FALLBACK_REPLY = 'The answer for this thread, written to the contract below.';

const EXAMPLE_WONTFIX_REASON = 'the naming follows the convention of every sibling route';

function shortPath(path: string): string {
  const segments = path.split('/');
  const last = segments.at(-1) ?? path;
  return last;
}

export const buildCommentAgentTitle = (c: PrComment): string => {
  const who = c.author.replace(/\[bot\]$/, '');
  if (c.source === 'review' && c.path) {
    const loc = c.line ? `${shortPath(c.path)}:${c.line}` : shortPath(c.path);
    return truncate(`resolve: ${who} on ${loc}`, TITLE_MAX);
  }
  return truncate(`resolve: ${who} comment`, TITLE_MAX);
};

const quotedBody = ({ body }: { readonly body: string }): ReadonlyArray<string> => {
  const text = body.trim();
  const source = text === '' ? '(empty body)' : text;
  return source.split('\n').map((line) => `${RESOLVER_KICKOFF_LABELS.quote} ${line}`.trimEnd());
};

const threadIdOf = ({ comment }: { readonly comment: PrComment }): string => {
  const threadId = comment.threadId ?? '';
  return comment.source === 'review' ? threadId.trim() : '';
};

const threadBlock = ({
  thread,
  position,
  total,
}: {
  readonly thread: CommentThread;
  readonly position: number;
  readonly total: number;
}): ReadonlyArray<string> => {
  const { head, replies } = thread;
  const lines: Array<string> = [`Thread ${position} of ${total}`];
  const threadId = threadIdOf({ comment: head });
  if (threadId !== '') {
    lines.push(`${RESOLVER_KICKOFF_LABELS.threadId}${threadId}`);
  }
  lines.push(`${RESOLVER_KICKOFF_LABELS.author}${head.author}`);
  const location = prCommentLocation({ comment: head });
  if (location !== null) {
    lines.push(`${RESOLVER_KICKOFF_LABELS.location}${location}`);
  }
  lines.push(`${RESOLVER_KICKOFF_LABELS.link}${head.url}`);
  lines.push(RESOLVER_KICKOFF_LABELS.comment, ...quotedBody({ body: head.body }));
  for (const reply of replies) {
    lines.push(`- reply from ${reply.author}:`, ...quotedBody({ body: reply.body }));
  }
  return lines;
};

const outcomeExample = ({
  threadId,
  isWontfix,
}: {
  readonly threadId: string;
  readonly isWontfix: boolean;
}): string => {
  if (isWontfix) {
    return `<<comment-wontfix threadId="${threadId}" reason="${EXAMPLE_WONTFIX_REASON}">>`;
  }
  return `<<comment-resolved threadId="${threadId}" commitSha="${EXAMPLE_SHA}">>`;
};

const workedExample = ({
  threadIds,
}: {
  readonly threadIds: ReadonlyArray<string>;
}): ReadonlyArray<string> =>
  threadIds.flatMap((threadId, index) => [
    outcomeExample({ threadId, isWontfix: index === 1 }),
    `<<comment-reply id="${threadId}">>${EXAMPLE_REPLIES[index] ?? EXAMPLE_FALLBACK_REPLY}<</comment-reply>>`,
  ]);

const reportingSection = ({
  threadIds,
}: {
  readonly threadIds: ReadonlyArray<string>;
}): ReadonlyArray<string> => {
  const count = threadIds.length;
  const noun = count === 1 ? 'thread' : 'threads';
  const subject =
    count === 1 ? 'the thread id listed above' : `each of the ${count} thread ids listed above`;
  return [
    RESOLVER_KICKOFF_LABELS.reporting,
    `Report every thread at the end of the same turn: exactly one outcome marker and exactly one reply block for ${subject}, each on its own line.`,
    'Never emit two outcome markers for one thread id, never leave a thread id without one, and never reuse a reply on another thread id.',
    'Pick one outcome marker per thread:',
    '<<comment-resolved threadId="the id above" commitSha="the sha you committed">> after a commit.',
    '<<comment-wontfix threadId="the id above" reason="one plain-text line">> without a change.',
    'The reply block carries the answer the reviewer reads, and it posts only on the thread whose id it names:',
    '<<comment-reply id="the id above">>the answer for that thread<</comment-reply>>',
    `A complete report for the ${count} ${noun} of this run reads exactly like this:`,
    ...workedExample({ threadIds }),
  ];
};

const instructionsSection = ({ count }: { readonly count: number }): ReadonlyArray<string> => {
  const target = count === 1 ? 'the thread above' : `all ${count} threads above`;
  return [
    RESOLVER_KICKOFF_LABELS.instructions,
    `Judge ${target} on the merits in one pass. When a thread asks for the right change, implement it and commit locally as you go. When the change it asks for is wrong or not worth making, leave the code unchanged and give the reason in its outcome marker. Never default to either outcome: read the code first, then decide per thread.`,
  ];
};

export const PROCEED_RESOLVER_PROMPT =
  'Proceed with the fix you proposed in your analysis. When done, commit and emit the <<comment-resolved>> marker as instructed.';

export type PriorContextIntent = 'retry' | 'recheck' | 'proceed';

export type PriorContext = {
  readonly threadId: string;
  readonly reply?: string | null;
  readonly commitShas?: ReadonlyArray<string>;
  readonly intent: PriorContextIntent;
};

const INTENT_SENTENCE: Record<PriorContextIntent, string> = {
  retry:
    'The reviewer asked for another pass on this thread. Read it again and decide from scratch.',
  recheck:
    'The commit recorded for this thread is no longer reachable on the branch. Apply the change again and commit it.',
  proceed: PROCEED_RESOLVER_PROMPT,
};

const amendInstruction = ({ sha }: { readonly sha: string }): string =>
  `You already committed ${sha} for this thread. If that exact commit is still HEAD and \`git branch -r --contains ${sha}\` prints nothing, apply the new changes and run \`git commit --amend --no-edit\` to keep one commit for this thread. If HEAD moved past it or a remote contains it, make a normal new commit instead. Never rebase or force-push.`;

const priorContextBlock = ({
  entries,
}: {
  readonly entries: ReadonlyArray<PriorContext>;
}): ReadonlyArray<string> => {
  const lines: Array<string> = [RESOLVER_KICKOFF_LABELS.priorWork];
  for (const entry of entries) {
    lines.push('', `${RESOLVER_KICKOFF_LABELS.threadId}${entry.threadId}`);
    const reply = entry.reply?.trim() ?? '';
    if (reply !== '') {
      lines.push('- the reply drafted last time:', ...quotedBody({ body: reply }));
    }
    const shas = entry.commitShas ?? [];
    if (shas.length > 0) {
      lines.push(`- commits recorded last time: ${shas.join(', ')}`);
    }
    lines.push(`- ${INTENT_SENTENCE[entry.intent]}`);
    const first = shas[0];
    if (first !== undefined && entry.intent !== 'proceed') {
      lines.push(`- ${amendInstruction({ sha: first })}`);
    }
  }
  return lines;
};

type KickoffParams = {
  readonly threads: ReadonlyArray<CommentThread>;
  readonly pr: PullRequestState;
  readonly hint: string;
  readonly priorContext?: ReadonlyArray<PriorContext>;
};

export const buildResolverKickoff = ({
  threads,
  pr,
  hint,
  priorContext,
}: KickoffParams): string => {
  const noun = threads.length === 1 ? 'thread' : 'threads';
  const lines: Array<string> = [
    `Resolve ${threads.length} ${noun} on PR #${pr.number}, branch \`${pr.headBranch}\`.`,
  ];
  for (const [index, thread] of threads.entries()) {
    lines.push('', ...threadBlock({ thread, position: index + 1, total: threads.length }));
  }
  if (priorContext !== undefined && priorContext.length > 0) {
    lines.push('', ...priorContextBlock({ entries: priorContext }));
  }
  lines.push('', ...instructionsSection({ count: threads.length }));
  const threadIds = threads.flatMap((thread) => {
    const threadId = threadIdOf({ comment: thread.head });
    return threadId === '' ? [] : [threadId];
  });
  if (threadIds.length > 0) {
    lines.push('', ...reportingSection({ threadIds }));
    lines.push('', RESOLVER_KICKOFF_LABELS.replyContract, ...REPLY_CONTRACT);
  }
  const operatorNotes = hint.trim();
  if (operatorNotes.length > 0) {
    lines.push('', RESOLVER_KICKOFF_LABELS.operatorNotes, operatorNotes);
  }
  return lines.join('\n');
};

export type CommentAgentArgs = {
  readonly name: string;
  readonly kind: AgentKind;
  readonly initialPrompt: string;
  readonly sourceThreadId?: string;
  readonly sourceThreadIds?: ReadonlyArray<string>;
  readonly sourceCommentUrl: string;
  readonly sourceKind: AgentSourceKind;
};

type ResolverAgentArgsParams = {
  readonly threads: ReadonlyArray<CommentThread>;
  readonly pr: PullRequestState;
  readonly hint?: string;
  readonly priorContext?: ReadonlyArray<PriorContext>;
};

export const buildResolverAgentArgs = ({
  threads,
  pr,
  hint = '',
  priorContext,
}: ResolverAgentArgsParams): CommentAgentArgs => {
  const first = threads[0];
  if (first === undefined) {
    throw new Error('combined resolver requires at least one thread');
  }
  const sourceThreadIds = threads.flatMap((thread) =>
    thread.head.threadId != null ? [thread.head.threadId] : [],
  );
  return {
    name:
      threads.length === 1
        ? buildCommentAgentTitle(first.head)
        : `resolve: ${threads.length} review threads`,
    kind: 'resolver',
    initialPrompt: buildResolverKickoff({
      threads,
      pr,
      hint,
      ...(priorContext !== undefined && { priorContext }),
    }),
    sourceThreadIds,
    sourceCommentUrl: first.head.url,
    sourceKind: 'review_comment',
  };
};

export const buildCombinedCommentAgentArgs = (
  threads: ReadonlyArray<CommentThread>,
  pr: PullRequestState,
  choice: ResolveModelChoice = {},
): CommentAgentArgs => {
  const args = buildResolverAgentArgs({ threads, pr, hint: choice.hint ?? '' });
  return { ...args, name: `resolve: ${threads.length} review threads` };
};

export type ResolveModelChoice = {
  readonly provider?: ProviderId;
  readonly model?: string;
  readonly effort?: EffortLevel;
  readonly hint?: string;
};

export const buildCommentAgentArgs = (
  c: PrComment,
  pr: PullRequestState,
  choice: ResolveModelChoice = {},
  replies: ReadonlyArray<PrComment> = [],
): CommentAgentArgs => {
  return {
    name: buildCommentAgentTitle(c),
    kind: 'resolver',
    initialPrompt: buildResolverKickoff({
      threads: [{ head: c, replies }],
      pr,
      hint: choice.hint ?? '',
    }),
    ...(c.source === 'review' && c.threadId ? { sourceThreadId: c.threadId } : {}),
    sourceCommentUrl: c.url,
    sourceKind: c.source === 'review' ? 'review_comment' : 'issue_comment',
  };
};

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max - 1)}…`;
}
