import { createContext } from 'react';
import type { RemoteImageLoader } from '../RemoteImage/loaderContext';

export type LocalImageLoader = RemoteImageLoader;

export const LocalImageLoaderContext = createContext<LocalImageLoader | null>(null);
