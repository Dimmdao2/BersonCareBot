import { RUNTIME_FLAG_DEFINITIONS as S5_RUNTIME_FLAG_DEFINITIONS } from './registry';
import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';

/**
 * ⛔ ЗНАЧЕНИЙ НАСТРОЕК В ЭТОМ ФАЙЛЕ НЕТ И БЫТЬ НЕ ДОЛЖНО (владелец, 01.08: «я не просил хардкод в
 * настройках — я всё прошу перенести в базу»). Здесь объявляется только КЛЮЧ: его область, контракт
 * значения и обязательность. Начальное значение заводится миграцией, дальше им распоряжается админка.
 *
 * Отсутствующая строка никогда не является значением: reader сообщает недоступность до
 * продуктового side effect. Пустое значение в существующей строке остаётся валидным значением.
 */
export const RUNTIME_FLAG_DEFINITIONS = {
  patient_program_discussion_ui_enabled: {
    key: 'patient_program_discussion_ui_enabled',
    scope: 'admin',
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
  },
  doctor_patient_support_comments_without_support_default_enabled: {
    key: 'doctor_patient_support_comments_without_support_default_enabled',
    scope: 'doctor',
  },
  doctor_patient_support_media_without_support_default_enabled: {
    key: 'doctor_patient_support_media_without_support_default_enabled',
    scope: 'doctor',
  },
} as const;

// Границы — это КОНТРАКТ значения (что вообще допустимо), а не само значение; они остаются в коде.
export const RUNTIME_INTEGER_SETTING_DEFINITIONS = {
  patient_treatment_plan_item_done_repeat_cooldown_minutes: {
    key: 'patient_treatment_plan_item_done_repeat_cooldown_minutes',
    scope: 'admin',
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

export const PUBLIC_RUNTIME_BOOLEAN_KEYS = [
  'auth_email_enabled',
  'auth_sms_enabled',
  'auth_telegram_enabled',
  'auth_max_enabled',
  'auth_oauth_google_enabled',
  'auth_oauth_yandex_enabled',
  'auth_oauth_vk_enabled',
  'auth_oauth_apple_enabled',
  'auth_passkey_enabled',
  'auth_pin_enabled',
  'oauth_yandex_enabled',
  'oauth_google_enabled',
  'oauth_apple_enabled',
  'oauth_vk_enabled',
  'public_sms_fallback_enabled',
  'specialist_signup_enabled',
  'patient_unsupported_client_fallback_enabled',
] as const;

export const PUBLIC_RUNTIME_STRING_KEYS = [
  'telegram_login_bot_username',
  'max_login_bot_nickname',
  'vk_web_login_url',
  'support_contact_url',
  'app_display_timezone',
] as const;

export const AUTHENTICATED_RUNTIME_BOOLEAN_KEYS = [
  'patient_app_maintenance_enabled',
  'video_playback_api_enabled',
] as const;

export const AUTHENTICATED_RUNTIME_STRING_KEYS = [
  'patient_app_maintenance_message',
  'patient_booking_url',
  'video_default_delivery',
] as const;

export const SERVER_RUNTIME_BOOLEAN_KEYS = ['debug_forward_to_admin'] as const;

export const SERVER_RUNTIME_TOKEN_LIST_KEYS = [
  'admin_telegram_ids',
  'admin_max_ids',
  'admin_phones',
  'admin_emails',
  'doctor_telegram_ids',
  'doctor_max_ids',
  'doctor_phones',
] as const;

// Только границы допустимого — самого значения здесь нет.
export const SERVER_RUNTIME_INTEGER_DEFINITIONS = {
  video_presign_ttl_seconds: {
    minValue: 60,
    maxValue: 604800,
  },
  booking_min_notice_hours: {
    minValue: 0,
    maxValue: 168,
  },
  booking_max_consecutive_slot_hours: {
    minValue: 1,
    maxValue: 24,
  },
} as const;

export type PublicRuntimeBooleanKey = (typeof PUBLIC_RUNTIME_BOOLEAN_KEYS)[number];
export type PublicRuntimeStringKey = (typeof PUBLIC_RUNTIME_STRING_KEYS)[number];
export type AuthenticatedRuntimeBooleanKey = (typeof AUTHENTICATED_RUNTIME_BOOLEAN_KEYS)[number];
export type AuthenticatedRuntimeStringKey = (typeof AUTHENTICATED_RUNTIME_STRING_KEYS)[number];
export type ServerRuntimeBooleanKey = (typeof SERVER_RUNTIME_BOOLEAN_KEYS)[number];
export type ServerRuntimeTokenListKey = (typeof SERVER_RUNTIME_TOKEN_LIST_KEYS)[number];
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
  return parsed === null || parsed < minValue
    ? null
    : Math.min(maxValue, Math.max(minValue, parsed));
}

function parseTokenListEnvelope(valueJson: unknown): string | null {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;
  return JSON.stringify(value.map((item) => String(item).trim()).filter(Boolean));
}

/** Нет значения — нет ответа. Подставлять константу вместо ответа запрещено (см. файл ошибки). */
function required<T>(key: string, value: T | null): T {
  if (value === null) throw new RuntimeSettingUnavailableError(key);
  return value;
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
    return required(key, parseBooleanEnvelope(row?.valueJson ?? null));
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
      return required(
        key,
        parseIntegerEnvelope(row?.valueJson ?? null, definition.minValue, definition.maxValue),
      );
    },
    async isFlagEnabled(flag: RuntimeFlag, context: RuntimeConfigContext): Promise<boolean> {
      return getBoolean(flag, context);
    },
    async getPublicBoolean(
      key: PublicRuntimeBooleanKey,
      operationFamily: RuntimeConfigOperationFamily = 'public_auth_config',
    ): Promise<boolean> {
      const row = await port.getEffective({
        key,
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['public'],
        operationFamily,
      });
      return required(key, parseBooleanEnvelope(row?.valueJson ?? null));
    },
    async getPublicString(
      key: PublicRuntimeStringKey,
      operationFamily: RuntimeConfigOperationFamily = 'public_auth_config',
    ): Promise<string> {
      const row = await port.getEffective({
        key,
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['public'],
        operationFamily,
      });
      return required(key, parseStringEnvelope(row?.valueJson ?? null));
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
      const row = await port.getEffective({
        key,
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['authenticated_client', 'public'],
        operationFamily: 'patient_runtime_config',
      });
      return required(key, parseBooleanEnvelope(row?.valueJson ?? null));
    },
    async getAuthenticatedString(
      key: AuthenticatedRuntimeStringKey,
      organizationId: string | null = null,
    ): Promise<string> {
      const row = await port.getEffective({
        key,
        scope: 'admin',
        organizationId,
        allowedAudiences: ['authenticated_client', 'public'],
        operationFamily: 'patient_runtime_config',
      });
      const value = parseStringEnvelope(row?.valueJson ?? null);
      return required(key, value);
    },
    async getServerBoolean(key: ServerRuntimeBooleanKey): Promise<boolean> {
      const row = await port.getEffective({
        key,
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['server'],
        operationFamily: 'public_auth_config',
      });
      return required(key, parseBooleanEnvelope(row?.valueJson ?? null));
    },
    /**
     * Security-sensitive authorization reads must not inherit the caller-side TTL cache: removing
     * an allowlisted principal must take effect on the very next session check.
     *
     * Отсутствие строки здесь тоже НЕ ответ. Пустой список выглядит безопасным («никого не
     * пускаем»), но это подменённая политика с тем же исходом, что и сбой, только молча — а
     * различить их потом нечем. Строку на каждый ключ заводит миграция.
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
      return required(key, parseTokenListEnvelope(row?.valueJson ?? null));
    },
    async getServerInteger(
      key: ServerRuntimeIntegerKey,
      organizationId: string | null = null,
    ): Promise<number> {
      const definition = SERVER_RUNTIME_INTEGER_DEFINITIONS[key];
      const row = await port.getEffective({
        key,
        scope: 'admin',
        organizationId,
        allowedAudiences: ['server'],
        operationFamily: 'patient_runtime_config',
      });
      return required(
        key,
        parseIntegerEnvelope(row?.valueJson ?? null, definition.minValue, definition.maxValue),
      );
    },
  };
}
