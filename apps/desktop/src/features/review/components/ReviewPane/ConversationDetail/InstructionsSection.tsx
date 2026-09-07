import { SectionSurface, Textarea } from '@goodboy/ui';

type Props = {
  readonly threadId: string;
  readonly value: string;
  readonly onChange: (params: { readonly threadId: string; readonly value: string }) => void;
};

export const InstructionsSection = ({ threadId, value, onChange }: Props) => (
  <SectionSurface label="Instructions for this conversation">
    <Textarea
      autoGrow
      minRows={1}
      maxRows={6}
      value={value}
      aria-label="Instructions for this conversation"
      placeholder="Optional: what to do differently on Retry"
      onChange={(event) => onChange({ threadId, value: event.target.value })}
    />
  </SectionSurface>
);
