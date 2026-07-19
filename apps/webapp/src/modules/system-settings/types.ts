/** Compatibility exports. The S5-0 registry is the only setting-key source. */
export {
  ALLOWED_KEYS,
  type SystemSettingKey,
  type SystemSettingScope,
} from "./registry";

import type { SystemSettingKey, SystemSettingScope } from "./registry";

export type SystemSetting = {
  key: SystemSettingKey;
  scope: SystemSettingScope;
  organizationId?: string | null;
  valueJson: unknown;
  updatedAt: string;
  updatedBy: string | null;
};
