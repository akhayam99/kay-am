import type { ReactNode } from 'react';
import type { RemoteImageLoader } from '../RemoteImage/loaderContext';
import { LocalImageLoaderContext } from './loaderContext';

type Props = {
  readonly load: RemoteImageLoader | null;
  readonly children: ReactNode;
};

export const LocalImageLoaderProvider = ({ load, children }: Props) => (
  <LocalImageLoaderContext.Provider value={load}>{children}</LocalImageLoaderContext.Provider>
);
