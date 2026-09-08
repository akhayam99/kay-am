import type { ClosingIssueReference } from './closingIssueReferences';

type Params = {
  readonly body: string;
  readonly references: ReadonlyArray<ClosingIssueReference>;
  readonly lines?: ReadonlyArray<string>;
};

export const appendClosingReferences = ({ body, references, lines }: Params): string => {
  const appended = [...references.map((reference) => reference.line), ...(lines ?? [])];
  if (appended.length === 0) {
    return body;
  }
  const block = appended.join('\n');
  const kept = body.trimEnd();
  return kept.length === 0 ? block : `${kept}\n\n${block}`;
};
