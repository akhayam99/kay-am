import { useState } from 'react';
import { LocalImage } from '@goodboy/ui';
import { ImageLightbox } from '../ImageLightbox';

type Props = {
  readonly path: string;
};

export const ToolImage = ({ path }: Props) => {
  const [openSrc, setOpenSrc] = useState<string | null>(null);

  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <LocalImage key={path} url={path} alt={path} imageClassName="max-h-32" onOpen={setOpenSrc} />
      {openSrc !== null ? (
        <ImageLightbox src={openSrc} alt={path} onClose={() => setOpenSrc(null)} />
      ) : null}
    </span>
  );
};
