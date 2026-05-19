import { z } from "zod";

export const PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY =
  "patient_default_promo_treatment_program_template_id" as const;

export type NormalizePatientDefaultPromoTemplateResult =
  | { ok: true; valueJson: { value: string } }
  | { ok: false; error: "invalid_value" };

/** Нормализация PATCH для ключа промо-шаблона (admin scope). */
export async function normalizePatientDefaultPromoTreatmentProgramTemplatePatch(
  getTemplate: (id: string) => Promise<{ status: string } | null>,
  raw: unknown,
): Promise<NormalizePatientDefaultPromoTemplateResult> {
  const inner =
    raw !== null && typeof raw === "object" && !Array.isArray(raw) && "value" in raw
      ? (raw as { value: unknown }).value
      : raw;
  const s = typeof inner === "string" ? inner.trim() : "";
  if (s === "") {
    return { ok: true, valueJson: { value: "" } };
  }
  if (!z.string().uuid().safeParse(s).success) {
    return { ok: false, error: "invalid_value" };
  }
  const tpl = await getTemplate(s);
  if (!tpl || tpl.status !== "published") {
    return { ok: false, error: "invalid_value" };
  }
  return { ok: true, valueJson: { value: s } };
}
