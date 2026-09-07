import type { ReactNode } from 'react';

type Props = {
  readonly label: string;
  readonly children: ReactNode;
};

export const Section = ({ label, children }: Props) => (
  <div className="flex min-w-0 flex-col gap-1">
    <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    {children}
  </div>
);
