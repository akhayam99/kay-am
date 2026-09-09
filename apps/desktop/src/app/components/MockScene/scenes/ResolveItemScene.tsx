import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../../../../shared/lib/storage-keys';
import { ResolveQueueHome } from '../../../../features/resolve/components/ResolveQueueHome';
import { EXPANDED_THREAD_ID, SESSION, seedResolveScene } from './resolveSeed';

export const ResolveItemScene = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    localStorage.removeItem(STORAGE_KEYS.inspectorPanelWidth);
    seedResolveScene({ expandedThreadId: EXPANDED_THREAD_ID });
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
