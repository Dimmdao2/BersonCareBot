import type { RuntimeConfigPort } from "@/modules/system-settings/runtimeConfig";

export const inMemoryAppRuntimeSettingsPort: RuntimeConfigPort = {
  async getEffective() {
    return null;
  },
};
