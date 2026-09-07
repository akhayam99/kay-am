import { useCallback, type ReactNode } from 'react';
import { LocalImageLoaderProvider, type RemoteImageLoader } from '@goodboy/ui';
import { readLocalImage } from '../../localImage';

type Props = {
  readonly sessionId: string | null;
  readonly children: ReactNode;
};

export const ChatImageLoaderProvider = ({ sessionId, children }: Props) => {
  const load = useCallback<RemoteImageLoader>(
    ({ url }) => {
      if (sessionId == null) {
        return Promise.reject(new Error('No image session available'));
      }
      return readLocalImage({ sessionId, path: url });
    },
    [sessionId],
  );
  return (
    <LocalImageLoaderProvider key={sessionId} load={sessionId == null ? null : load}>
      {children}
    </LocalImageLoaderProvider>
  );
};
