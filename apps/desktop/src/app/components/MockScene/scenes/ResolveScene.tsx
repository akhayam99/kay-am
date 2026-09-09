import { useEffect, useState } from 'react';
import { ResolveQueueHome } from '../../../../features/resolve/components/ResolveQueueHome';
import { SESSION, seedResolveScene } from './resolveSeed';

export const ResolveScene = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    seedResolveScene({ expandedThreadId: null });
    setIsReady(true);
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <ResolveQueueHome session={SESSION} />
    </main>
  );
};
