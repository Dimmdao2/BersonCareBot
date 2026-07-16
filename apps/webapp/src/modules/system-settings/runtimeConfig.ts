export const RUNTIME_FLAG_DEFINITIONS = {
  patient_program_discussion_ui_enabled: {
    key: "patient_program_discussion_ui_enabled",
    scope: "admin",
    defaultValue: false,
  },
} as const;

export type RuntimeFlag = keyof typeof RUNTIME_FLAG_DEFINITIONS;
export const RUNTIME_BOOLEAN_SETTING_DEFINITIONS = {
  ...RUNTIME_FLAG_DEFINITIONS,
  patient_program_discussion_media_submission_enabled: {
    key: "patient_program_discussion_media_submission_enabled",
    scope: "admin",
    defaultValue: false,
  },
  doctor_patient_support_comments_without_support_default_enabled: {
    key: "doctor_patient_support_comments_without_support_default_enabled",
    scope: "doctor",
    defaultValue: false,
  },
  doctor_patient_support_media_without_support_default_enabled: {
    key: "doctor_patient_support_media_without_support_default_enabled",
    scope: "doctor",
    defaultValue: false,
  },
} as const;

export const RUNTIME_INTEGER_SETTING_DEFINITIONS = {
  patient_treatment_plan_item_done_repeat_cooldown_minutes: {
    key: "patient_treatment_plan_item_done_repeat_cooldown_minutes",
    scope: "admin",
    defaultValue: 60,
    minValue: 5,
    maxValue: 180,
  },
} as const;

export type RuntimeBooleanSetting = keyof typeof RUNTIME_BOOLEAN_SETTING_DEFINITIONS;
export type RuntimeIntegerSetting = keyof typeof RUNTIME_INTEGER_SETTING_DEFINITIONS;
export type RuntimeConfigAudience = "public" | "authenticated_client" | "server";
export type RuntimeConfigOperationFamily =
  | "public_auth_config"
  | "patient_runtime_config"
  | "public_booking_config";

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
};

export type RuntimeConfigPort = {
  getEffective(input: {
    key: string;
    scope: string;
    organizationId: string | null;
    allowedAudiences: readonly RuntimeConfigAudience[];
    operationFamily: RuntimeConfigOperationFamily;
  }): Promise<RuntimeSettingRow | null>;
};

function parseBooleanEnvelope(valueJson: unknown): boolean | null {
  if (valueJson === null || typeof valueJson !== "object" || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  return typeof value === "boolean" ? value : null;
}

function parseStringEnvelope(valueJson: unknown): string | null {
  if (valueJson === null || typeof valueJson !== "object" || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  return typeof value === "string" ? value : null;
}

export const PUBLIC_RUNTIME_BOOLEAN_DEFAULTS = {
  oauth_yandex_enabled: false,
  oauth_google_enabled: false,
  oauth_apple_enabled: false,
  public_sms_fallback_enabled: true,
  specialist_signup_enabled: false,
} as const;

export const PUBLIC_RUNTIME_STRING_DEFAULTS = {
  telegram_login_bot_username: "",
  max_login_bot_nickname: "",
  vk_web_login_url: "",
  support_contact_url: "",
  app_display_timezone: "Europe/Moscow",
} as const;

export const AUTHENTICATED_RUNTIME_BOOLEAN_DEFAULTS = {
  patient_app_maintenance_enabled: false,
  video_playback_api_enabled: false,
} as const;

export const AUTHENTICATED_RUNTIME_STRING_DEFAULTS = {
  patient_app_maintenance_message: "",
  patient_booking_url: "",
  video_default_delivery: "auto",
} as const;

export type PublicRuntimeBooleanKey = keyof typeof PUBLIC_RUNTIME_BOOLEAN_DEFAULTS;
export type PublicRuntimeStringKey = keyof typeof PUBLIC_RUNTIME_STRING_DEFAULTS;
export type AuthenticatedRuntimeBooleanKey = keyof typeof AUTHENTICATED_RUNTIME_BOOLEAN_DEFAULTS;
export type AuthenticatedRuntimeStringKey = keyof typeof AUTHENTICATED_RUNTIME_STRING_DEFAULTS;

function parseIntegerEnvelope(
  valueJson: unknown,
  minValue: number,
  maxValue: number,
): number | null {
  if (valueJson === null || typeof valueJson !== "object" || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value)
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number.parseInt(value.trim(), 10)
        : null;
  return parsed === null || parsed < 1
    ? null
    : Math.min(maxValue, Math.max(minValue, parsed));
}

export function createRuntimeConfigProvider(port: RuntimeConfigPort) {
  async function getBoolean(
    key: RuntimeBooleanSetting,
    context: RuntimeConfigContext,
  ): Promise<boolean> {
    if (!context.patientUserId.trim() || !context.organizationId.trim()) {
      throw new Error("runtime_config_context_required");
    }
    const definition = RUNTIME_BOOLEAN_SETTING_DEFINITIONS[key];
    const row = await port.getEffective({
      key: definition.key,
      scope: definition.scope,
      organizationId: context.organizationId,
      allowedAudiences: ["authenticated_client", "public"],
      operationFamily: "patient_runtime_config",
    });
    return parseBooleanEnvelope(row?.valueJson ?? null) ?? definition.defaultValue;
  }

  return {
    getBoolean,
    async getInteger(
      key: RuntimeIntegerSetting,
      context: RuntimeConfigContext,
    ): Promise<number> {
      if (!context.patientUserId.trim() || !context.organizationId.trim()) {
        throw new Error("runtime_config_context_required");
      }
      const definition = RUNTIME_INTEGER_SETTING_DEFINITIONS[key];
      const row = await port.getEffective({
        key: definition.key,
        scope: definition.scope,
        organizationId: context.organizationId,
        allowedAudiences: ["authenticated_client", "public"],
        operationFamily: "patient_runtime_config",
      });
      return parseIntegerEnvelope(
        row?.valueJson ?? null,
        definition.minValue,
        definition.maxValue,
      ) ?? definition.defaultValue;
    },
    async isFlagEnabled(flag: RuntimeFlag, context: RuntimeConfigContext): Promise<boolean> {
      return getBoolean(flag, context);
    },
    async getPublicBoolean(
      key: PublicRuntimeBooleanKey,
      operationFamily: RuntimeConfigOperationFamily = "public_auth_config",
    ): Promise<boolean> {
      try {
        const row = await port.getEffective({
          key,
          scope: "admin",
          organizationId: null,
          allowedAudiences: ["public"],
          operationFamily,
        });
        return parseBooleanEnvelope(row?.valueJson ?? null) ?? PUBLIC_RUNTIME_BOOLEAN_DEFAULTS[key];
      } catch {
        return PUBLIC_RUNTIME_BOOLEAN_DEFAULTS[key];
      }
    },
    async getPublicString(
      key: PublicRuntimeStringKey,
      operationFamily: RuntimeConfigOperationFamily = "public_auth_config",
    ): Promise<string> {
      try {
        const row = await port.getEffective({
          key,
          scope: "admin",
          organizationId: null,
          allowedAudiences: ["public"],
          operationFamily,
        });
        return parseStringEnvelope(row?.valueJson ?? null) ?? PUBLIC_RUNTIME_STRING_DEFAULTS[key];
      } catch {
        return PUBLIC_RUNTIME_STRING_DEFAULTS[key];
      }
    },
    async getAuthenticatedBoolean(key: AuthenticatedRuntimeBooleanKey): Promise<boolean> {
      try {
        const row = await port.getEffective({
          key,
          scope: "admin",
          organizationId: null,
          allowedAudiences: ["authenticated_client", "public"],
          operationFamily: "patient_runtime_config",
        });
        return parseBooleanEnvelope(row?.valueJson ?? null) ?? AUTHENTICATED_RUNTIME_BOOLEAN_DEFAULTS[key];
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
          scope: "admin",
          organizationId,
          allowedAudiences: ["authenticated_client", "public"],
          operationFamily: "patient_runtime_config",
        });
        return parseStringEnvelope(row?.valueJson ?? null) ?? AUTHENTICATED_RUNTIME_STRING_DEFAULTS[key];
      } catch {
        return AUTHENTICATED_RUNTIME_STRING_DEFAULTS[key];
      }
    },
  };
}
