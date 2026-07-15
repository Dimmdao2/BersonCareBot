export const RUNTIME_FLAG_DEFINITIONS = {
  patient_program_discussion_ui_enabled: {
    key: "patient_program_discussion_ui_enabled",
    scope: "admin",
    defaultValue: false,
  },
} as const;

export type RuntimeFlag = keyof typeof RUNTIME_FLAG_DEFINITIONS;
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

export function createRuntimeConfigProvider(port: RuntimeConfigPort) {
  return {
    async isFlagEnabled(flag: RuntimeFlag, context: RuntimeConfigContext): Promise<boolean> {
      if (!context.patientUserId.trim() || !context.organizationId.trim()) {
        throw new Error("runtime_config_context_required");
      }
      const definition = RUNTIME_FLAG_DEFINITIONS[flag];
      const row = await port.getEffective({
        key: definition.key,
        scope: definition.scope,
        organizationId: context.organizationId,
        allowedAudiences: ["authenticated_client", "public"],
      });
      return parseBooleanEnvelope(row?.valueJson ?? null) ?? definition.defaultValue;
    },
  };
}
