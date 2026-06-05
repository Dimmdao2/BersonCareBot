import { z } from "zod";

const settingEnvelopeSchema = z.object({ value: z.unknown() }).passthrough();

/** Parse admin/doctor `system_settings.value_json` envelope (`{"value": …}`). */
export function parseSettingEnvelopeValue(valueJson: unknown): unknown | null {
  const parsed = settingEnvelopeSchema.safeParse(valueJson);
  if (!parsed.success) return null;
  return parsed.data.value;
}

const smsFallbackEnvelopeSchema = z.object({ value: z.union([z.boolean(), z.string()]) }).passthrough();

/** `sms_fallback_enabled` row shape (doctor/admin scopes). */
export function parseSmsFallbackEnabledValue(valueJson: unknown): boolean | null {
  const parsed = smsFallbackEnvelopeSchema.safeParse(valueJson);
  if (!parsed.success) return null;
  const v = parsed.data.value;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}
