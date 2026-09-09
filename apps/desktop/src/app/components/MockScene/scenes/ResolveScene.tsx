import { useEffect, useState } from 'react';
import { ResolveQueueHome } from '../../../../features/resolve/components/ResolveQueueHome';
import { SESSION, seedResolveScene } from './resolveSeed';

export const ResolveScene = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    seedResolveScene({ expandedThreadId: null });
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    const expandFooter = () => {
      const toggle = [
        ...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'),
      ].find((button) => button.textContent?.includes('Pushed and posted') === true);
      if (toggle === undefined) {
        return false;
      }
      if (toggle.getAttribute('aria-expanded') !== 'true') {
        toggle.click();
      }
      return true;
    };
    const interval = window.setInterval(() => {
      if (expandFooter()) {
        window.clearInterval(interval);
      }
    }, 150);
    return () => window.clearInterval(interval);
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <ResolveQueueHome session={SESSION} />
    </main>
  );
};
