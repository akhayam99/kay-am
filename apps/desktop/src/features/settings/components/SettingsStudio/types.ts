import type { ProviderId, ProviderLifecycleAction } from '@goodboy/types';

import type { IntegrationGlyphProvider } from '../../../integrations/components/IntegrationGlyph';

export type SettingsScope = 'app' | 'workspace' | 'providers' | 'tools';

export type SettingsFocus = {
  readonly scope: SettingsScope;
  readonly section?: string;
  readonly tool?: IntegrationGlyphProvider;
  readonly provider?: ProviderId;
  readonly action?: ProviderLifecycleAction;
};
