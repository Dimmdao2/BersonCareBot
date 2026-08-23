import type { RuntimeSettingsRepository } from '@/modules/system-settings/ports';

export const inMemoryAppRuntimeSettingsPort: RuntimeSettingsRepository = {
  async getClinicPlatformIntegrationAvailability() {
    return null;
  },
  async getEffective() {
    return null;
  },
  async getSnapshotRows() {
    return [];
  },
  async upsert(input) {
    return { ...input };
  },
};
