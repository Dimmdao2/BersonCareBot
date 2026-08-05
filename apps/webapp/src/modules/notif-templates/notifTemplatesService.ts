import type {
  SystemSetting,
  SystemSettingKey,
  SystemSettingScope,
} from '@/modules/system-settings/types';
import {
  DEFAULT_MANAGED_NOTIF_PRESENTATION,
  MANAGED_NOTIF_TEMPLATE_VERSION,
  adaptLegacyNotifTemplate,
  createDefaultManagedNotifTemplate,
  parseManagedNotifPresentation,
  parseManagedNotifTemplateFor,
  validateManagedNotifTemplateChannels,
  type ManagedNotifPresentation,
  type ManagedNotifPresentationEntry,
  type ManagedNotifTemplateChannels,
  type ManagedNotifTemplateEntry,
  type ManagedNotifTemplateMetadata,
} from './managedNotifTemplate';

export const NOTIF_TEMPLATE_EVENTS = ['created', 'cancelled', 'rescheduled'] as const;
export type NotifTemplateEvent = (typeof NOTIF_TEMPLATE_EVENTS)[number];

export const NOTIF_TEMPLATE_AUDIENCES = ['patient', 'doctor'] as const;
export type NotifTemplateAudience = (typeof NOTIF_TEMPLATE_AUDIENCES)[number];

export const NOTIF_TEMPLATE_VARIABLES = [
  'date',
  'type',
  'city',
  'name',
  'phone',
  'reason',
] as const;

export const NOTIF_TEMPLATE_MAX_LENGTH = 2000;

/** Mirrors defaults from integrator notifTemplatePort.ts (same keys, same texts). */
export const NOTIF_TEMPLATE_DEFAULTS: Record<
  NotifTemplateEvent,
  Record<NotifTemplateAudience, string>
> = {
  created: {
    patient: 'Запись подтверждена: {{date}}\n{{type}}{{city}}',
    doctor: 'Новая запись: {{name}}, {{phone}}\nДата: {{date}}',
  },
  cancelled: {
    patient: 'Запись на {{date}} отменена.{{reason}}',
    doctor: 'Отмена записи: {{name}}\nДата: {{date}}',
  },
  rescheduled: {
    patient: 'Запись перенесена на {{date}}\n{{type}}',
    doctor: 'Перенос записи: {{name}}, {{phone}}\nНовая дата: {{date}}',
  },
};

export function notifTemplateSettingKey(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
): SystemSettingKey {
  return `notif_template:${event}:${audience}` as SystemSettingKey;
}

function extractTextFromValueJson(valueJson: unknown): string | null {
  if (!valueJson || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const v = (valueJson as Record<string, unknown>).value;
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v;
}

export type NotifTemplateEntry = {
  event: NotifTemplateEvent;
  audience: NotifTemplateAudience;
  text: string;
  isDefault: boolean;
};

type SystemSettingsReadOptionsLike = { organizationId?: string | null };
type SystemSettingsWriteOptionsLike = {
  organizationId?: string | null;
  allowPlatformGlobalFallbackWrite?: true;
};

type SystemSettingsLike = {
  getSetting(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    options?: SystemSettingsReadOptionsLike,
  ): Promise<SystemSetting | null>;
  updateSetting(
    key: string,
    scope: SystemSettingScope,
    value: unknown,
    updatedBy: string | null,
    options?: SystemSettingsWriteOptionsLike,
  ): Promise<SystemSetting>;
  updateSettingIfUnchanged(
    key: string,
    scope: SystemSettingScope,
    value: unknown,
    updatedBy: string | null,
    expectedUpdatedAt: string | null,
    options?: SystemSettingsWriteOptionsLike,
  ): Promise<SystemSetting | null>;
};

export class NotifTemplateConflictError extends Error {
  constructor() {
    super('notification_template_conflict');
    this.name = 'NotifTemplateConflictError';
  }
}

/**
 * Notification templates (`notif_template:*`) are PER-ORG (see `orgScopedKeys.ts`) — each clinic edits
 * its own wording. `organizationId` is org-first-then-global-fallback on read, and required by the
 * `system-settings` service chokepoint on write (throws `SystemSettingsOrgContextRequiredError` if
 * missing — the caller/route resolves it from the current session's organization membership).
 */
export function createNotifTemplatesService(
  systemSettings: SystemSettingsLike,
  options?: {
    /**
     * 3.2: physically refuses branding template writes unless a passing `branding` mutation
     * decision already ran in this request.
     */
    assertWriteClearance?: (mechanic: 'branding') => void;
  },
) {
  const presentationCarrierKey = notifTemplateSettingKey('created', 'patient');
  const assertWriteClearance = options?.assertWriteClearance;

  function metadataFor(
    row: SystemSetting | null,
    source: ManagedNotifTemplateMetadata['effectiveSource'],
    revision: number,
    targetRow: SystemSetting | null = row,
  ): ManagedNotifTemplateMetadata {
    return {
      revision,
      effectiveSource: source,
      updatedAt: row?.updatedAt || null,
      updatedBy: row?.updatedBy ?? null,
      writeToken: targetRow?.updatedAt ?? null,
    };
  }

  async function readResolutionRows(
    key: SystemSettingKey,
    organizationId?: string | null,
  ): Promise<{
    globalRow: SystemSetting | null;
    effectiveRow: SystemSetting | null;
    exactOrgRow: SystemSetting | null;
  }> {
    const normalizedOrganizationId = organizationId?.trim() || null;
    const globalRow = await systemSettings.getSetting(key, 'admin', { organizationId: null });
    if (!normalizedOrganizationId) {
      return { globalRow, effectiveRow: globalRow, exactOrgRow: null };
    }
    const effectiveRow = await systemSettings.getSetting(key, 'admin', {
      organizationId: normalizedOrganizationId,
    });
    const exactOrgRow =
      effectiveRow?.organizationId === normalizedOrganizationId ? effectiveRow : null;
    return { globalRow, effectiveRow, exactOrgRow };
  }

  async function getTemplate(
    event: NotifTemplateEvent,
    audience: NotifTemplateAudience,
    options: SystemSettingsReadOptionsLike = {},
  ): Promise<NotifTemplateEntry> {
    const key = notifTemplateSettingKey(event, audience);
    const row = await systemSettings.getSetting(key, 'admin', options);
    const stored = extractTextFromValueJson(row?.valueJson ?? null);
    return {
      event,
      audience,
      text: stored ?? NOTIF_TEMPLATE_DEFAULTS[event][audience],
      isDefault: stored === null,
    };
  }

  async function getManagedTemplate(
    event: NotifTemplateEvent,
    audience: NotifTemplateAudience,
    options: SystemSettingsReadOptionsLike = {},
  ): Promise<ManagedNotifTemplateEntry> {
    const key = notifTemplateSettingKey(event, audience);
    const { globalRow, effectiveRow, exactOrgRow } = await readResolutionRows(
      key,
      options.organizationId,
    );
    const orgManaged = exactOrgRow
      ? parseManagedNotifTemplateFor(event, audience, exactOrgRow.valueJson)
      : null;
    const platformManaged = parseManagedNotifTemplateFor(
      event,
      audience,
      globalRow?.valueJson ?? null,
    );
    const orgLegacyStored = extractTextFromValueJson(exactOrgRow?.valueJson ?? null);
    const platformLegacyStored = extractTextFromValueJson(globalRow?.valueJson ?? null);
    const legacyForAdaptation = orgLegacyStored ?? platformLegacyStored;
    const adaptedLegacy = legacyForAdaptation
      ? adaptLegacyNotifTemplate(event, audience, legacyForAdaptation)
      : null;
    const managed =
      orgManaged ??
      (orgLegacyStored ? adaptedLegacy?.template : null) ??
      platformManaged ??
      adaptedLegacy?.template ??
      createDefaultManagedNotifTemplate(event, audience);
    const source: ManagedNotifTemplateMetadata['effectiveSource'] =
      orgManaged || orgLegacyStored
        ? 'organization'
        : platformManaged
          ? 'platform'
          : platformLegacyStored
            ? 'legacy'
            : 'hardcoded';
    const sourceRow =
      orgManaged || orgLegacyStored
        ? exactOrgRow
        : platformManaged || platformLegacyStored
          ? globalRow
          : null;
    const legacyStored = extractTextFromValueJson(effectiveRow?.valueJson ?? null);
    const legacyText = legacyStored ?? NOTIF_TEMPLATE_DEFAULTS[event][audience];
    const legacyCompatibility = legacyStored
      ? adaptLegacyNotifTemplate(event, audience, legacyStored).compatibility
      : { status: 'compatible' as const, preservedText: legacyText, forbiddenVariables: [] };
    const targetRow = options.organizationId?.trim() ? exactOrgRow : globalRow;
    return {
      event,
      audience,
      legacyText,
      legacyIsDefault: legacyStored === null,
      legacyCompatibility,
      managed,
      metadata: metadataFor(sourceRow, source, managed.revision, targetRow),
    };
  }

  async function getPresentation(
    options: SystemSettingsReadOptionsLike = {},
  ): Promise<ManagedNotifPresentationEntry> {
    const { globalRow, exactOrgRow } = await readResolutionRows(
      presentationCarrierKey,
      options.organizationId,
    );
    const orgPresentation = exactOrgRow
      ? parseManagedNotifPresentation(exactOrgRow.valueJson)
      : null;
    const platformPresentation = parseManagedNotifPresentation(globalRow?.valueJson ?? null);
    const presentation =
      orgPresentation ?? platformPresentation ?? DEFAULT_MANAGED_NOTIF_PRESENTATION;
    const source = orgPresentation
      ? 'organization'
      : platformPresentation
        ? 'platform'
        : 'hardcoded';
    const sourceRow = orgPresentation ? exactOrgRow : platformPresentation ? globalRow : null;
    return {
      presentation,
      metadata: metadataFor(
        sourceRow,
        source,
        presentation.revision,
        options.organizationId?.trim() ? exactOrgRow : globalRow,
      ),
    };
  }

  function writeOptions(options: SystemSettingsWriteOptionsLike): SystemSettingsWriteOptionsLike {
    const organizationId = options.organizationId?.trim() || null;
    return organizationId
      ? { organizationId }
      : { organizationId: null, allowPlatformGlobalFallbackWrite: true };
  }

  return {
    async getAllTemplates(
      options: SystemSettingsReadOptionsLike = {},
    ): Promise<NotifTemplateEntry[]> {
      return Promise.all(
        NOTIF_TEMPLATE_EVENTS.flatMap((event) =>
          NOTIF_TEMPLATE_AUDIENCES.map((audience) => getTemplate(event, audience, options)),
        ),
      );
    },

    async saveTemplate(
      event: NotifTemplateEvent,
      audience: NotifTemplateAudience,
      text: string,
      userId: string,
      options: SystemSettingsWriteOptionsLike = {},
    ): Promise<NotifTemplateEntry> {
      const key = notifTemplateSettingKey(event, audience);
      const current = await systemSettings.getSetting(key, 'admin', options);
      const currentValue = current?.valueJson;
      const currentRecord =
        currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
          ? (currentValue as Record<string, unknown>)
          : {};
      await systemSettings.updateSetting(
        key,
        'admin',
        { ...currentRecord, value: text },
        userId,
        options,
      );
      return { event, audience, text, isDefault: false };
    },

    async getManagedTemplates(
      options: SystemSettingsReadOptionsLike = {},
    ): Promise<ManagedNotifTemplateEntry[]> {
      return Promise.all(
        NOTIF_TEMPLATE_EVENTS.flatMap((event) =>
          NOTIF_TEMPLATE_AUDIENCES.map((audience) => getManagedTemplate(event, audience, options)),
        ),
      );
    },

    getManagedPresentation(
      options: SystemSettingsReadOptionsLike = {},
    ): Promise<ManagedNotifPresentationEntry> {
      return getPresentation(options);
    },

    async saveManagedTemplate(
      event: NotifTemplateEvent,
      audience: NotifTemplateAudience,
      channels: ManagedNotifTemplateChannels,
      userId: string,
      expectedUpdatedAt: string | null,
      options: SystemSettingsWriteOptionsLike = {},
    ): Promise<ManagedNotifTemplateEntry> {
      assertWriteClearance?.('branding');
      const validatedChannels = validateManagedNotifTemplateChannels(event, audience, channels);
      const key = notifTemplateSettingKey(event, audience);
      const { globalRow, effectiveRow, exactOrgRow } = await readResolutionRows(
        key,
        options.organizationId,
      );
      const targetRow = options.organizationId?.trim() ? exactOrgRow : globalRow;
      const previous = targetRow
        ? parseManagedNotifTemplateFor(event, audience, targetRow.valueJson)
        : null;
      const legacyText =
        extractTextFromValueJson(effectiveRow?.valueJson ?? null) ??
        NOTIF_TEMPLATE_DEFAULTS[event][audience];
      const managed = {
        version: MANAGED_NOTIF_TEMPLATE_VERSION,
        revision: (previous?.revision ?? 0) + 1,
        channels: validatedChannels,
      } as const;
      const existingValue = targetRow?.valueJson;
      const existingRecord =
        existingValue && typeof existingValue === 'object' && !Array.isArray(existingValue)
          ? (existingValue as Record<string, unknown>)
          : {};
      const saved = await systemSettings.updateSettingIfUnchanged(
        key,
        'admin',
        { ...existingRecord, value: legacyText, managed },
        userId,
        expectedUpdatedAt,
        writeOptions(options),
      );
      if (!saved) throw new NotifTemplateConflictError();
      const source = options.organizationId?.trim() ? 'organization' : 'platform';
      const legacyCompatibility = adaptLegacyNotifTemplate(
        event,
        audience,
        legacyText,
      ).compatibility;
      return {
        event,
        audience,
        legacyText,
        legacyIsDefault: false,
        legacyCompatibility,
        managed,
        metadata: metadataFor(saved, source, managed.revision, saved),
      };
    },

    async saveManagedPresentation(
      input: Pick<ManagedNotifPresentation, 'layout' | 'signature' | 'contacts'>,
      userId: string,
      expectedUpdatedAt: string | null,
      options: SystemSettingsWriteOptionsLike = {},
    ): Promise<ManagedNotifPresentationEntry> {
      assertWriteClearance?.('branding');
      const signature = input.signature.trim();
      const contacts = input.contacts.trim();
      if (
        signature.length > 500 ||
        contacts.length > 500 ||
        /(?:https?:\/\/|\/\/)/i.test(`${signature}\n${contacts}`)
      ) {
        throw new Error('invalid_notification_presentation');
      }
      const { globalRow, effectiveRow, exactOrgRow } = await readResolutionRows(
        presentationCarrierKey,
        options.organizationId,
      );
      const targetRow = options.organizationId?.trim() ? exactOrgRow : globalRow;
      const previous = targetRow ? parseManagedNotifPresentation(targetRow.valueJson) : null;
      const presentation: ManagedNotifPresentation = {
        version: MANAGED_NOTIF_TEMPLATE_VERSION,
        revision: (previous?.revision ?? 0) + 1,
        layout: input.layout,
        signature,
        contacts,
        logoAssetId: null,
        avatarAssetId: null,
      };
      const legacyText =
        extractTextFromValueJson(effectiveRow?.valueJson ?? null) ??
        NOTIF_TEMPLATE_DEFAULTS.created.patient;
      const existingValue = targetRow?.valueJson;
      const existingRecord =
        existingValue && typeof existingValue === 'object' && !Array.isArray(existingValue)
          ? (existingValue as Record<string, unknown>)
          : {};
      const saved = await systemSettings.updateSettingIfUnchanged(
        presentationCarrierKey,
        'admin',
        { ...existingRecord, value: legacyText, presentation },
        userId,
        expectedUpdatedAt,
        writeOptions(options),
      );
      if (!saved) throw new NotifTemplateConflictError();
      const source = options.organizationId?.trim() ? 'organization' : 'platform';
      return { presentation, metadata: metadataFor(saved, source, presentation.revision, saved) };
    },
  };
}

export type NotifTemplatesService = ReturnType<typeof createNotifTemplatesService>;
