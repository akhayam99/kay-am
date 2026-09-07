import type { ReactNode } from 'react';
import { LocalImageLoaderContext, type LocalImageLoader } from './loaderContext';

type Props = {
  readonly load: LocalImageLoader | null;
  readonly children: ReactNode;
};

export const LocalImageLoaderProvider = ({ load, children }: Props) => (
  <LocalImageLoaderContext.Provider value={load}>{children}</LocalImageLoaderContext.Provider>
);
