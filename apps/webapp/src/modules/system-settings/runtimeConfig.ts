import { RUNTIME_FLAG_DEFINITIONS as S5_RUNTIME_FLAG_DEFINITIONS } from './registry';

export const RUNTIME_FLAG_DEFINITIONS = {
  patient_program_discussion_ui_enabled: {
    key: 'patient_program_discussion_ui_enabled',
    scope: 'admin',
    defaultValue: false,
  },
} as const;

/** S5-0 declarative source contract; evaluation remains intentionally deferred. */
export { S5_RUNTIME_FLAG_DEFINITIONS };

export type RuntimeFlag = keyof typeof RUNTIME_FLAG_DEFINITIONS;
export const RUNTIME_BOOLEAN_SETTING_DEFINITIONS = {
  ...RUNTIME_FLAG_DEFINITIONS,
  patient_program_discussion_media_submission_enabled: {
    key: 'patient_program_discussion_media_submission_enabled',
    scope: 'admin',
    defaultValue: false,
  },
  doctor_patient_support_comments_without_support_default_enabled: {
    key: 'doctor_patient_support_comments_without_support_default_enabled',
    scope: 'doctor',
    defaultValue: false,
  },
  doctor_patient_support_media_without_support_default_enabled: {
    key: 'doctor_patient_support_media_without_support_default_enabled',
    scope: 'doctor',
    defaultValue: false,
  },
} as const;

export const RUNTIME_INTEGER_SETTING_DEFINITIONS = {
  patient_treatment_plan_item_done_repeat_cooldown_minutes: {
    key: 'patient_treatment_plan_item_done_repeat_cooldown_minutes',
    scope: 'admin',
    defaultValue: 60,
    minValue: 5,
    maxValue: 180,
  },
} as const;

export type RuntimeBooleanSetting = keyof typeof RUNTIME_BOOLEAN_SETTING_DEFINITIONS;
export type RuntimeIntegerSetting = keyof typeof RUNTIME_INTEGER_SETTING_DEFINITIONS;
export type RuntimeConfigAudience = 'public' | 'authenticated_client' | 'server';
export type RuntimeConfigOperationFamily =
  | 'public_auth_config'
  | 'auth_role_config'
  | 'patient_runtime_config'
  | 'public_booking_config';

export type RuntimeConfigContext = {
  patientUserId: string;
  organizationId: string;
};

export type RuntimeSettingRow = {
  key: string;
  scope: string;
  organizationId: string | null;
  audience: RuntimeConfigAudience;
  valueJson: unknown;
  updatedAt?: string;
  updatedBy?: string | null;
};

export type RuntimeConfigPort = {
  getEffective(input: {
    key: string;
    scope: string;
    organizationId: string | null;
    allowedAudiences: readonly RuntimeConfigAudience[];
    operationFamily: RuntimeConfigOperationFamily;
    allowGlobalFallback?: boolean;
  }): Promise<RuntimeSettingRow | null>;
};

function parseBooleanEnvelope(valueJson: unknown): boolean | null {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  return typeof value === 'boolean' ? value : null;
}

function parseStringEnvelope(valueJson: unknown): string | null {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  return typeof value === 'string' ? value : null;
}

export const PUBLIC_RUNTIME_BOOLEAN_DEFAULTS = {
  auth_email_enabled: true,
  auth_sms_enabled: false,
  auth_telegram_enabled: true,
  auth_max_enabled: true,
  auth_oauth_google_enabled: true,
  auth_oauth_yandex_enabled: true,
  auth_oauth_apple_enabled: false,
  auth_passkey_enabled: false,
  auth_pin_enabled: false,
  oauth_yandex_enabled: false,
  oauth_google_enabled: false,
  oauth_apple_enabled: false,
  public_sms_fallback_enabled: false,
  specialist_signup_enabled: false,
  patient_unsupported_client_fallback_enabled: false,
} as const;

export const PUBLIC_RUNTIME_STRING_DEFAULTS = {
  telegram_login_bot_username: '',
  max_login_bot_nickname: '',
  vk_web_login_url: '',
  support_contact_url: '',
  app_display_timezone: 'Europe/Moscow',
} as const;

export const AUTHENTICATED_RUNTIME_BOOLEAN_DEFAULTS = {
  patient_app_maintenance_enabled: false,
  video_playback_api_enabled: false,
} as const;

export const AUTHENTICATED_RUNTIME_STRING_DEFAULTS = {
  patient_app_maintenance_message: '',
  patient_booking_url: '',
  video_default_delivery: 'auto',
} as const;

export const SERVER_RUNTIME_BOOLEAN_DEFAULTS = {
  debug_forward_to_admin: false,
  auth_2fa_enabled: false,
} as const;

export const SERVER_RUNTIME_TOKEN_LIST_DEFAULTS = {
  admin_telegram_ids: '',
  admin_max_ids: '',
  admin_phones: '',
  admin_emails: '',
  doctor_telegram_ids: '',
  doctor_max_ids: '',
  doctor_phones: '',
} as const;

export const SERVER_RUNTIME_INTEGER_DEFINITIONS = {
  video_presign_ttl_seconds: {
    defaultValue: 3600,
    minValue: 60,
    maxValue: 604800,
  },
} as const;

export type PublicRuntimeBooleanKey = keyof typeof PUBLIC_RUNTIME_BOOLEAN_DEFAULTS;
export type PublicRuntimeStringKey = keyof typeof PUBLIC_RUNTIME_STRING_DEFAULTS;
export type AuthenticatedRuntimeBooleanKey = keyof typeof AUTHENTICATED_RUNTIME_BOOLEAN_DEFAULTS;
export type AuthenticatedRuntimeStringKey = keyof typeof AUTHENTICATED_RUNTIME_STRING_DEFAULTS;
export type ServerRuntimeBooleanKey = keyof typeof SERVER_RUNTIME_BOOLEAN_DEFAULTS;
export type ServerRuntimeTokenListKey = keyof typeof SERVER_RUNTIME_TOKEN_LIST_DEFAULTS;
export type ServerRuntimeIntegerKey = keyof typeof SERVER_RUNTIME_INTEGER_DEFINITIONS;

function parseIntegerEnvelope(
  valueJson: unknown,
  minValue: number,
  maxValue: number,
): number | null {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number.parseInt(value.trim(), 10)
        : null;
  return parsed === null || parsed < 1 ? null : Math.min(maxValue, Math.max(minValue, parsed));
}

function parseTokenListEnvelope(valueJson: unknown): string | null {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;
  return JSON.stringify(value.map((item) => String(item).trim()).filter(Boolean));
}

export function createRuntimeConfigProvider(port: RuntimeConfigPort) {
  async function getBoolean(
    key: RuntimeBooleanSetting,
    context: RuntimeConfigContext,
  ): Promise<boolean> {
    if (!context.patientUserId.trim() || !context.organizationId.trim()) {
      throw new Error('runtime_config_context_required');
    }
    const definition = RUNTIME_BOOLEAN_SETTING_DEFINITIONS[key];
    const row = await port.getEffective({
      key: definition.key,
      scope: definition.scope,
      organizationId: context.organizationId,
      allowedAudiences: ['authenticated_client', 'public'],
      operationFamily: 'patient_runtime_config',
    });
    return parseBooleanEnvelope(row?.valueJson ?? null) ?? definition.defaultValue;
  }

  return {
    getBoolean,
    async getInteger(key: RuntimeIntegerSetting, context: RuntimeConfigContext): Promise<number> {
      if (!context.patientUserId.trim() || !context.organizationId.trim()) {
        throw new Error('runtime_config_context_required');
      }
      const definition = RUNTIME_INTEGER_SETTING_DEFINITIONS[key];
      const row = await port.getEffective({
        key: definition.key,
        scope: definition.scope,
        organizationId: context.organizationId,
        allowedAudiences: ['authenticated_client', 'public'],
        operationFamily: 'patient_runtime_config',
      });
      return (
        parseIntegerEnvelope(row?.valueJson ?? null, definition.minValue, definition.maxValue) ??
        definition.defaultValue
      );
    },
    async isFlagEnabled(flag: RuntimeFlag, context: RuntimeConfigContext): Promise<boolean> {
      return getBoolean(flag, context);
    },
    async getPublicBoolean(
      key: PublicRuntimeBooleanKey,
      operationFamily: RuntimeConfigOperationFamily = 'public_auth_config',
    ): Promise<boolean> {
      try {
        const row = await port.getEffective({
          key,
          scope: 'admin',
          organizationId: null,
          allowedAudiences: ['public'],
          operationFamily,
        });
        return parseBooleanEnvelope(row?.valueJson ?? null) ?? PUBLIC_RUNTIME_BOOLEAN_DEFAULTS[key];
      } catch {
        return PUBLIC_RUNTIME_BOOLEAN_DEFAULTS[key];
      }
    },
    async getPublicString(
      key: PublicRuntimeStringKey,
      operationFamily: RuntimeConfigOperationFamily = 'public_auth_config',
    ): Promise<string> {
      try {
        const row = await port.getEffective({
          key,
          scope: 'admin',
          organizationId: null,
          allowedAudiences: ['public'],
          operationFamily,
        });
        return parseStringEnvelope(row?.valueJson ?? null) ?? PUBLIC_RUNTIME_STRING_DEFAULTS[key];
      } catch {
        return PUBLIC_RUNTIME_STRING_DEFAULTS[key];
      }
    },
    /**
     * Public read that reports ABSENCE as `null` and lets a FAILED read throw, instead of
     * flattening both into the compiled default. Same reason as `getServerTokenListStrict` below:
     * a caller that caches must be able to tell "the database says there is no value" (an answer,
     * cacheable) from "the read did not happen" (not an answer, must never be cached).
     */
    async getPublicStringOrNull(
      key: PublicRuntimeStringKey,
      operationFamily: RuntimeConfigOperationFamily = 'public_auth_config',
    ): Promise<string | null> {
      const row = await port.getEffective({
        key,
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['public'],
        operationFamily,
      });
      return parseStringEnvelope(row?.valueJson ?? null);
    },
    async getAuthenticatedBoolean(key: AuthenticatedRuntimeBooleanKey): Promise<boolean> {
      try {
        const row = await port.getEffective({
          key,
          scope: 'admin',
          organizationId: null,
          allowedAudiences: ['authenticated_client', 'public'],
          operationFamily: 'patient_runtime_config',
        });
        return (
          parseBooleanEnvelope(row?.valueJson ?? null) ??
          AUTHENTICATED_RUNTIME_BOOLEAN_DEFAULTS[key]
        );
      } catch {
        return AUTHENTICATED_RUNTIME_BOOLEAN_DEFAULTS[key];
      }
    },
    async getAuthenticatedString(
      key: AuthenticatedRuntimeStringKey,
      organizationId: string | null = null,
    ): Promise<string> {
      try {
        const row = await port.getEffective({
          key,
          scope: 'admin',
          organizationId,
          allowedAudiences: ['authenticated_client', 'public'],
          operationFamily: 'patient_runtime_config',
          allowGlobalFallback: key !== 'patient_booking_url',
        });
        return (
          parseStringEnvelope(row?.valueJson ?? null) ?? AUTHENTICATED_RUNTIME_STRING_DEFAULTS[key]
        );
      } catch {
        return AUTHENTICATED_RUNTIME_STRING_DEFAULTS[key];
      }
    },
    async getServerBoolean(key: ServerRuntimeBooleanKey): Promise<boolean> {
      try {
        const row = await port.getEffective({
          key,
          scope: 'admin',
          organizationId: null,
          allowedAudiences: ['server'],
          operationFamily: 'public_auth_config',
        });
        return parseBooleanEnvelope(row?.valueJson ?? null) ?? SERVER_RUNTIME_BOOLEAN_DEFAULTS[key];
      } catch {
        return SERVER_RUNTIME_BOOLEAN_DEFAULTS[key];
      }
    },
    async getServerTokenList(
      key: ServerRuntimeTokenListKey,
      fallbackValue: string,
      operationFamily: RuntimeConfigOperationFamily = 'auth_role_config',
    ): Promise<string> {
      try {
        const row = await port.getEffective({
          key,
          scope: 'admin',
          organizationId: null,
          allowedAudiences: ['server'],
          operationFamily,
        });
        return parseTokenListEnvelope(row?.valueJson ?? null) ?? fallbackValue;
      } catch {
        return fallbackValue;
      }
    },
    /**
     * Security-sensitive authorization reads must not inherit the compatibility
     * fallback or the caller-side TTL cache. In particular, removing an
     * allowlisted principal must take effect on the very next session check.
     */
    async getServerTokenListStrict(
      key: ServerRuntimeTokenListKey,
      operationFamily: RuntimeConfigOperationFamily = 'auth_role_config',
    ): Promise<string> {
      const row = await port.getEffective({
        key,
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['server'],
        operationFamily,
      });
      return parseTokenListEnvelope(row?.valueJson ?? null) ?? '';
    },
    async getServerInteger(key: ServerRuntimeIntegerKey): Promise<number> {
      const definition = SERVER_RUNTIME_INTEGER_DEFINITIONS[key];
      try {
        const row = await port.getEffective({
          key,
          scope: 'admin',
          organizationId: null,
          allowedAudiences: ['server'],
          operationFamily: 'patient_runtime_config',
        });
        return (
          parseIntegerEnvelope(row?.valueJson ?? null, definition.minValue, definition.maxValue) ??
          definition.defaultValue
        );
      } catch {
        return definition.defaultValue;
      }
    },
  };
}
