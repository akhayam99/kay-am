import type { ReactNode } from 'react';
import { Eyebrow } from '@goodboy/ui';

type Props = {
  readonly label: string;
  readonly count: number;
  readonly children: ReactNode;
};

export const ConversationGroup = ({ label, count, children }: Props) => (
  <div className="flex flex-col gap-1.5">
    <Eyebrow label={`${label} ${count}`} muted />
    <ul role="presentation" className="flex flex-col gap-0.5">
      {children}
    </ul>
  </div>
);
