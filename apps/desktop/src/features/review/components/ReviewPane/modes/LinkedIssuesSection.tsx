import type { ReactNode } from 'react';
import { GitBranch, Unlink } from 'lucide-react';
import { Eyebrow, GhostActionButton } from '@goodboy/ui';
import type { LinkedIssue } from '@goodboy/types';
import { ExternalRefActions } from '../../../../../shared/components/ExternalRefActions';
import { LinkedWorkRow } from '../../../../../shared/components/LinkedWorkRow';

type Props = {
  readonly issues: ReadonlyArray<LinkedIssue>;
  readonly action: ReactNode;
  readonly unlinkableNumbers: ReadonlySet<number>;
  readonly unlinkingNumber: number | null;
  readonly onOpenIssue: (issueNumber: number) => void;
  readonly onUnlink: (issueNumber: number) => void;
};

export const LinkedIssuesSection = ({
  issues,
  action,
  unlinkableNumbers,
  unlinkingNumber,
  onOpenIssue,
  onUnlink,
}: Props) => {
  if (issues.length === 0 && action === null) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Eyebrow label="Linked issues" muted className="px-0.5 font-medium" />
        {action}
      </div>
      <div className="flex flex-col gap-1">
        {issues.map((issue) => (
          <LinkedWorkRow
            key={issue.url}
            leading={{ kind: 'icon', icon: GitBranch, tone: 'info', label: 'GitHub' }}
            identifier={`#${issue.number}`}
            title={issue.title ?? 'GitHub issue'}
            navigation="internal"
            onClick={() => onOpenIssue(issue.number)}
            actions={
              <span className="inline-flex shrink-0 items-center gap-0.5">
                {unlinkableNumbers.has(issue.number) && (
                  <span className="opacity-0 motion-safe:transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <GhostActionButton
                      icon={Unlink}
                      tone="danger"
                      label="Unlink"
                      ariaLabel={`Unlink issue #${issue.number}`}
                      disabled={unlinkingNumber !== null}
                      onClick={() => onUnlink(issue.number)}
                    />
                  </span>
                )}
                <ExternalRefActions
                  url={issue.url}
                  label={`issue #${issue.number}`}
                  hostLabel="GitHub"
                />
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
};
