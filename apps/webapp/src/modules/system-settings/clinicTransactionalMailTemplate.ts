import { z } from 'zod';

/** Owner-authored branded identity for clinic patient auth-code mail. */
export const clinicTransactionalMailTemplateSchema = z.object({
  senderDisplayNameTemplate: z.string().trim().min(1).max(500),
  authCodeSubjectTemplate: z.string().trim().min(1).max(500),
  authCodeTextTemplate: z.string().trim().min(1).max(4000),
});

export type ClinicTransactionalMailTemplate = z.infer<typeof clinicTransactionalMailTemplateSchema>;

function hasRequiredPlaceholders(template: ClinicTransactionalMailTemplate): boolean {
  return (
    template.senderDisplayNameTemplate.includes('{{clinicName}}') &&
    template.senderDisplayNameTemplate.includes('{{platformName}}') &&
    template.authCodeSubjectTemplate.includes('{{senderDisplayName}}') &&
    template.authCodeTextTemplate.includes('{{senderDisplayName}}') &&
    template.authCodeTextTemplate.includes('{{code}}')
  );
}

/**
 * The sole webapp normalizer for this setting's inner envelope value.
 * Missing or incomplete owner copy stays invalid: branded delivery must fail closed rather than
 * invent a platform fallback for the clinic's identity.
 */
export function normalizeClinicTransactionalMailTemplate(
  value: unknown,
): ClinicTransactionalMailTemplate | null {
  const parsed = clinicTransactionalMailTemplateSchema.safeParse(value);
  return parsed.success && hasRequiredPlaceholders(parsed.data) ? parsed.data : null;
}

export function parseClinicTransactionalMailTemplatePatchValue(normalizedEnvelope: {
  value: unknown;
}): { ok: true; value: ClinicTransactionalMailTemplate } | { ok: false } {
  const value = normalizeClinicTransactionalMailTemplate(normalizedEnvelope.value);
  return value === null ? { ok: false } : { ok: true, value };
}

/** Extracts the stored inner value without creating a second UI-specific normalizer. */
export function clinicTransactionalMailTemplateInnerFromValueJson(
  valueJson: unknown,
): ClinicTransactionalMailTemplate | null {
  const inner =
    typeof valueJson === 'object' && valueJson !== null && 'value' in valueJson
      ? (valueJson as { value: unknown }).value
      : valueJson;
  return normalizeClinicTransactionalMailTemplate(inner);
}
