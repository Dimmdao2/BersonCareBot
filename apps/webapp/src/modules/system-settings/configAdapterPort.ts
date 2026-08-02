import type { RuntimeSettingsRepository } from './ports';
import type { PublicAuthChannelCapability } from './ports';

export type ConfigAdapterPort = {
  runtimeSettings: RuntimeSettingsRepository;
  readAdminSystemSettingString(key: string): Promise<string | null>;
  readExactOrganizationAdminSystemSettingString(
    key: string,
    organizationId: string,
  ): Promise<string | null>;
  readPublicAuthChannelConfigured(channel: PublicAuthChannelCapability): Promise<boolean>;
};

let configAdapterPort: ConfigAdapterPort | undefined;

/** Composition root binds the DB-backed settings readers once. */
export function bindConfigAdapterPort(port: ConfigAdapterPort): void {
  configAdapterPort = port;
}

export function requireConfigAdapterPort(): ConfigAdapterPort {
  if (!configAdapterPort) {
    throw new Error('ConfigAdapterPort is not bound. Call ensureSystemSettingsConfigAdapterBound().');
  }
  return configAdapterPort;
}
