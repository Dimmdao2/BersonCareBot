import { z } from "zod";

/** Inner `value` for admin key `smtp_outbound` after PATCH normalization. */
export const smtpOutboundInnerSchema = z.object({
  host: z.string().trim().min(1, "smtp host required"),
  port: z.preprocess((v) => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10);
    return v;
  }, z.number().int().min(1).max(65535)),
  secure: z.preprocess((v) => {
    if (v === true || v === 1 || v === "1" || v === "true") return true;
    return false;
  }, z.boolean()),
  user: z.string().trim().min(1, "smtp user required"),
  /** Пустая строка = не менять пароль при upsert (см. merge в updateSetting). */
  password: z.string().optional().default(""),
  from: z.string().trim().email("invalid From email"),
});

export type SmtpOutboundInner = z.infer<typeof smtpOutboundInnerSchema>;

export function parseSmtpOutboundPatchValue(normalizedEnvelope: {
  value: unknown;
}): { ok: true; value: SmtpOutboundInner } | { ok: false } {
  const parsed = smtpOutboundInnerSchema.safeParse(normalizedEnvelope.value);
  if (!parsed.success) return { ok: false };
  return { ok: true, value: parsed.data };
}

/**
 * Extract and parse the SMTP inner config from a raw `value_json` envelope (from system_settings).
 * Handles both `{ value: {...} }` envelopes and bare inner objects.
 * Used by web-push VAPID subject derivation and channel-availability resolution across the webapp.
 * Relocated here from sendTransactionalSmtp.ts (S10 — that file deleted after SMTP send migrated to integrator).
 */
export function smtpInnerFromValueJson(valueJson: unknown): ReturnType<typeof smtpOutboundInnerSchema.safeParse> {
  const inner =
    typeof valueJson === "object" && valueJson !== null && "value" in valueJson ?
      (valueJson as { value: unknown }).value
    : valueJson;
  return smtpOutboundInnerSchema.safeParse(inner);
}
