import { createContext } from 'react';
import type { RemoteImageLoader } from '../RemoteImage/loaderContext';

export const LocalImageLoaderContext = createContext<RemoteImageLoader | null>(null);
