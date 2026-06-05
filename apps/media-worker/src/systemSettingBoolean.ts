import { z } from "zod";

const systemSettingBooleanJsonSchema = z
  .object({
    value: z.boolean().optional(),
  })
  .passthrough();

/** Parse admin `system_settings.value_json` boolean flag (`{"value": true}`). */
export function parseSystemSettingBoolean(valueJson: unknown): boolean {
  const parsed = systemSettingBooleanJsonSchema.safeParse(valueJson);
  if (!parsed.success) return false;
  return parsed.data.value === true;
}
