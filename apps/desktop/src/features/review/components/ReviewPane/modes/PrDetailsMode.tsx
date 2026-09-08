import { useMemo, useState } from 'react';
import type { PrDetail, PullRequestState, SessionId } from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore } from '../../../../../store';
import type { LensKind } from '../../../../../store';
import { DetailProperties } from '../../../../../shared/components/StudioDetail/DetailProperties';
import { githubPullRequestFields, resolveDetailFields } from '../../../../../shared/detail-fields';
import { useSessionRepo } from '../../../../../store/slices/worktrees/useSessionRepo';
import { closingIssueReferences } from '../../../../github/closingIssueReferences';
import { closingReferenceLines } from '../../../../github/closingReferenceLines';
import { removeClosingReference } from '../../../../github/removeClosingReference';
import { LinkIssueToPrPopover } from '../../../../github/components/LinkIssueToPrPopover';
import { PrOverview } from '../../../../github/components/GitHubStudio/PrOverview';
import { PrReviewers } from '../../../../github/components/GitHubStudio/PrReviewers';
import { LinkedIssuesSection } from './LinkedIssuesSection';
import { ModeShell } from './ModeShell';

type Props = {
  readonly sessionId: SessionId;
  readonly pr: PullRequestState;
  readonly detail: PrDetail | null;
  readonly onBack: (() => void) | null;
  readonly onSelectLens: (lens: LensKind) => void;
  readonly onMutated: () => void;
};

export const PrDetailsMode = ({
  sessionId,
  pr,
  detail,
  onBack,
  onSelectLens,
  onMutated,
}: Props) => {
  const [unlinkingIssueNumber, setUnlinkingIssueNumber] = useState<number | null>(null);
  const linkedIssues = useAppStore((s) => s.sessionGithub[sessionId]?.linkedIssues ?? EMPTY_ARRAY);
  const externalTasks = useAppStore((s) => s.sessionExternalTasks[sessionId] ?? EMPTY_ARRAY);
  const editPr = useAppStore((s) => s.editPr);
  const requestReview = useAppStore((s) => s.requestReview);
  const setFocusedGithubIssueNumber = useAppStore((s) => s.setFocusedGithubIssueNumber);
  const repo = useSessionRepo({ sessionId });
  const branch = repo?.branch ?? null;

  const properties = useMemo(
    () => resolveDetailFields({ registry: githubPullRequestFields, entity: pr }),
    [pr],
  );
  const linkedIssueNumbers = useMemo(
    () => new Set(linkedIssues.map((issue) => issue.number)),
    [linkedIssues],
  );
  const githubTasks = useMemo(
    () => externalTasks.filter((task) => task.provider === 'github'),
    [externalTasks],
  );
  const linkCandidates = useMemo(
    () =>
      closingIssueReferences({ tasks: githubTasks, branch, body: pr.body }).filter(
        (reference) => !linkedIssueNumbers.has(reference.number),
      ),
    [branch, githubTasks, linkedIssueNumbers, pr.body],
  );
  const unlinkableIssueNumbers = useMemo(() => closingReferenceLines({ body: pr.body }), [pr.body]);

  const onUnlink = async (issueNumber: number) => {
    setUnlinkingIssueNumber(issueNumber);
    await editPr(sessionId, pr.number, {
      body: removeClosingReference({ body: pr.body, number: issueNumber }),
    }).catch(() => undefined);
    setUnlinkingIssueNumber(null);
    onMutated();
  };

  const onAddReviewers = (logins: ReadonlyArray<string>) => {
    void (async () => {
      await requestReview(sessionId, pr.number, logins).catch(() => undefined);
      onMutated();
    })();
  };

  return (
    <ModeShell label="PR details" onBack={onBack}>
      <PrOverview pr={pr} sessionId={sessionId} onMutated={onMutated} />
      <LinkedIssuesSection
        issues={linkedIssues}
        action={
          githubTasks.length > 0 ? (
            <LinkIssueToPrPopover
              sessionId={sessionId}
              prNumber={pr.number}
              body={pr.body}
              candidates={linkCandidates}
            />
          ) : null
        }
        unlinkableNumbers={unlinkableIssueNumbers}
        unlinkingNumber={unlinkingIssueNumber}
        onOpenIssue={(issueNumber) => {
          setFocusedGithubIssueNumber(sessionId, issueNumber);
          onSelectLens('github_issue');
        }}
        onUnlink={(issueNumber) => void onUnlink(issueNumber)}
      />
      <PrReviewers
        detail={detail}
        projectRoot={repo?.repoRoot ?? null}
        {...(repo?.projectId !== undefined && { projectId: repo.projectId })}
        onAddReviewers={onAddReviewers}
      />
      <DetailProperties entries={properties} />
    </ModeShell>
  );
};
