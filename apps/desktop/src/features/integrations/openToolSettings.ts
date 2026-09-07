import type { IntegrationGlyphProvider } from './components/IntegrationGlyph';

type Params = {
  readonly tool?: IntegrationGlyphProvider;
};

export const openToolSettings = ({ tool }: Params) => {
  window.dispatchEvent(
    new CustomEvent('goodboy:open-settings', { detail: { scope: 'tools', tool } }),
  );
};
