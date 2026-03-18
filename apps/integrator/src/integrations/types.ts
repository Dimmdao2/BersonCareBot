/** Категории интеграций для каталога подключенных источников/провайдеров. */
export type IntegrationKind = 'messenger' | 'system' | 'provider';

/** Поддерживаемые направления трафика конкретной интеграции. */
export type IntegrationCapability = {
  supportsIncoming: boolean;
  supportsOutgoing: boolean;
};

/** Описание интеграции для реестра и диагностики при старте. */
export type IntegrationDescriptor = {
  id: string;
  kind: IntegrationKind;
  capabilities: IntegrationCapability;
  supportedIncomingTypes: string[];
  supportedOutgoingTypes: string[];
};
