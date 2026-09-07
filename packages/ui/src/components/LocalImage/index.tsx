import { useContext, useState } from 'react';
import { cn } from '../../cn';
import { Button } from '../Button';
import { LocalImageLoaderContext } from './loaderContext';

type Props = {
  readonly url: string;
  readonly alt: string;
  readonly imageClassName?: string;
  readonly onOpen?: (dataUri: string) => void;
};

type State =
  | { readonly kind: 'blocked' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly dataUri: string }
  | { readonly kind: 'failed' };

export const LocalImage = ({ url, alt, imageClassName, onOpen }: Props) => {
  const load = useContext(LocalImageLoaderContext);
  const [state, setState] = useState<State>({ kind: 'blocked' });

  if (load == null) {
    return alt;
  }

  const requestImage = () => {
    setState({ kind: 'loading' });
    void load({ url })
      .then((dataUri) => {
        if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(dataUri)) {
          setState({ kind: 'failed' });
          return;
        }
        setState({ kind: 'loaded', dataUri });
      })
      .catch(() => setState({ kind: 'failed' }));
  };

  if (state.kind === 'loading') {
    return <span role="status">Loading local image: {url}</span>;
  }

  if (state.kind === 'loaded') {
    const image = (
      <img
        src={state.dataUri}
        alt={alt}
        className={cn('max-h-96 max-w-full rounded-md object-contain', imageClassName)}
      />
    );
    if (onOpen !== undefined) {
      return (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <button
            type="button"
            aria-label={`Open image ${url}`}
            onClick={() => onOpen(state.dataUri)}
          >
            {image}
          </button>
          <code className="break-words">{url}</code>
        </span>
      );
    }
    return image;
  }

  return (
    <span className="flex min-w-0 items-start gap-2 rounded-md border border-dashed border-border-soft px-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {alt !== '' && alt !== url ? <span className="text-foreground">{alt}</span> : null}
        <span>
          {state.kind === 'failed' ? 'Could not load local image.' : 'Local image. Click to load.'}
        </span>
        <code className="break-words">{url}</code>
      </span>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={requestImage}>
        {state.kind === 'failed' ? 'Try again' : 'Load image'}
      </Button>
    </span>
  );
};
