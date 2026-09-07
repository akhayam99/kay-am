import { invoke } from '@tauri-apps/api/core';

type Params = {
  readonly sessionId: string;
  readonly path: string;
};

export const readLocalImage = async ({ sessionId, path }: Params): Promise<string> => {
  return invoke<string>('local_image_read', { sessionId, path });
};
