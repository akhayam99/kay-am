import { appendAttribution } from '../../../shared/utils/attribution';

type Closure = { commitSha?: string; reason?: string; reply?: string };

const VERDICT_FIXED = '**Valid.**';
const VERDICT_CLOSED = '**Not applying.**';

const commitLine = (sha: string, prUrl: string | null): string => {
  const short = sha.slice(0, 7);
  const commitUrl = prUrl ? prUrl.replace(/\/pull\/\d+(?:\/.*)?$/, `/commit/${sha}`) : null;
  return commitUrl && commitUrl !== prUrl
    ? `**Resolution.** Fixed in [\`${short}\`](${commitUrl}).`
    : `**Resolution.** Fixed in \`${short}\`.`;
};

type Params = {
  readonly closure: Closure | undefined;
  readonly prUrl: string | null;
  readonly isAttributed: boolean;
};

export const buildResolutionReplyBody = ({
  closure,
  prUrl,
  isAttributed,
}: Params): string | null => {
  if (!closure) {
    return null;
  }
  const reply = closure.reply?.trim() ?? '';
  const sha = closure.commitSha?.trim() ?? '';
  const reason = closure.reason?.trim() ?? '';

  const body = (() => {
    if (sha.length > 0) {
      const verdict = reply.length > 0 ? `${VERDICT_FIXED} ${reply}` : VERDICT_FIXED;
      return [verdict, commitLine(sha, prUrl)].join('\n\n');
    }
    if (reason.length > 0) {
      const verdict = reply.length > 0 ? `${VERDICT_CLOSED} ${reply}` : VERDICT_CLOSED;
      return [verdict, `**Resolution.** Closed without a change: ${reason}`].join('\n\n');
    }
    return reply.length > 0 ? reply : null;
  })();

  return body === null ? null : appendAttribution({ body, isEnabled: isAttributed });
};
