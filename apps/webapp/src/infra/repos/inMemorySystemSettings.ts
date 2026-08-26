import type {
  SystemSettingsPort,
  SystemSettingsReadOptions,
  SystemSettingsUpsertRow,
  SystemSettingsWriteOptions,
} from '@/modules/system-settings/ports';
import type {
  SystemSetting,
  SystemSettingKey,
  SystemSettingScope,
} from '@/modules/system-settings/types';

export function createInMemorySystemSettingsPort(): SystemSettingsPort {
  const store = new Map<string, SystemSetting>();

  function normalizeOrganizationId(organizationId: string | null | undefined) {
    return organizationId?.trim() || null;
  }

  function makeKey(key: string, scope: string, organizationId: string | null = null) {
    return `${organizationId ?? 'global'}:${scope}:${key}`;
  }

  return {
    async getByKey(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      options: SystemSettingsReadOptions = {},
    ): Promise<SystemSetting | null> {
      const organizationId = normalizeOrganizationId(options.organizationId);
      if (organizationId) {
        return (
          store.get(makeKey(key, scope, organizationId)) ?? store.get(makeKey(key, scope)) ?? null
        );
      }
      return store.get(makeKey(key, scope)) ?? null;
    },

    async getWebPushVapidPublicKeyOnly(): Promise<string | null> {
      const row = store.get(makeKey('web_push_vapid', 'admin'));
      const vj = row?.valueJson;
      if (vj === null || typeof vj !== 'object' || !('value' in (vj as Record<string, unknown>)))
        return null;
      const inner = (vj as Record<string, unknown>).value;
      if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return null;
      const pk = (inner as Record<string, unknown>).publicKey;
      return typeof pk === 'string' && pk.trim() ? pk.trim() : null;
    },


    async getByScope(
      scope: SystemSettingScope,
      options: SystemSettingsReadOptions = {},
    ): Promise<SystemSetting[]> {
      const organizationId = normalizeOrganizationId(options.organizationId);
      const rows = Array.from(store.values()).filter(
        (s) =>
          s.scope === scope && (s.organizationId === null || s.organizationId === organizationId),
      );
      const byKey = new Map<string, SystemSetting>();
      for (const row of rows) {
        const previous = byKey.get(row.key);
        if (!previous || row.organizationId) byKey.set(row.key, row);
      }
      return Array.from(byKey.values());
    },

    async upsert(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      valueJson: unknown,
      updatedBy: string | null,
      options: SystemSettingsWriteOptions = {},
    ): Promise<SystemSetting> {
      const organizationId = normalizeOrganizationId(options.organizationId);
      const setting: SystemSetting = {
        key,
        scope,
        organizationId,
        valueJson,
        updatedAt: new Date().toISOString(),
        updatedBy,
      };
      store.set(makeKey(key, scope, organizationId), setting);
      return setting;
    },

    async compareAndSwap(key, scope, valueJson, updatedBy, expectedUpdatedAt, options = {}) {
      const organizationId = normalizeOrganizationId(options.organizationId);
      const identity = makeKey(key, scope, organizationId);
      const current = store.get(identity) ?? null;
      if ((current?.updatedAt ?? null) !== expectedUpdatedAt) return null;
      const setting: SystemSetting = {
        key,
        scope,
        organizationId,
        valueJson,
        updatedAt: new Date().toISOString(),
        updatedBy,
      };
      store.set(identity, setting);
      return setting;
    },

    async upsertManyInTransaction(rows: SystemSettingsUpsertRow[]): Promise<SystemSetting[]> {
      const out: SystemSetting[] = [];
      for (const row of rows) {
        const setting: SystemSetting = {
          key: row.key,
          scope: row.scope,
          organizationId: normalizeOrganizationId(row.organizationId),
          valueJson: row.valueJson,
          updatedAt: new Date().toISOString(),
          updatedBy: row.updatedBy,
        };
        store.set(makeKey(row.key, row.scope, setting.organizationId ?? null), setting);
        out.push(setting);
      }
      return out;
    },
    async delete(key, scope, _updatedBy, options = {}) {
      return store.delete(makeKey(key, scope, normalizeOrganizationId(options.organizationId)));
    },
  };
}

export const inMemorySystemSettingsPort = createInMemorySystemSettingsPort();
