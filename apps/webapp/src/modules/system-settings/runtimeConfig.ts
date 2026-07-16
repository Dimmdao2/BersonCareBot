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
    organizationId: string;
    allowedAudiences: readonly RuntimeConfigAudience[];
  }): Promise<RuntimeSettingRow | null>;
};

function parseBooleanEnvelope(valueJson: unknown): boolean | null {
  if (valueJson === null || typeof valueJson !== "object" || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  return typeof value === "boolean" ? value : null;
}

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
  };
}
