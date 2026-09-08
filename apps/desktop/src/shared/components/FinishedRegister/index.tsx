import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { CountToggle, Divider } from '@goodboy/ui';

type Props = {
  readonly label: string;
  readonly count: number;
  readonly visible: ReactNode;
  readonly earlier?: ReactNode;
  readonly earlierCount?: number;
};

export const FinishedRegister = ({
  label,
  count,
  visible,
  earlier = null,
  earlierCount = 0,
}: Props) => {
  const [isEarlierShown, setIsEarlierShown] = useState(false);

  if (count === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4" aria-label={`${label} history`}>
      <Divider />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </h2>
        <span className="text-2xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      {visible}
      {earlierCount > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-center">
            <CountToggle
              label="Earlier"
              count={earlierCount}
              isShown={isEarlierShown}
              icon={ChevronDown}
              onChange={setIsEarlierShown}
            />
          </div>
          {isEarlierShown ? earlier : null}
        </div>
      ) : null}
    </section>
  );
};
