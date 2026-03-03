export type IntegrationKind = 'messenger' | 'system' | 'provider';

export type IntegrationCapability = {
  supportsIncoming: boolean;
  supportsOutgoing: boolean;
};

export type IntegrationDescriptor = {
  id: string;
  kind: IntegrationKind;
  capabilities: IntegrationCapability;
  supportedIncomingTypes: string[];
  supportedOutgoingTypes: string[];
};
