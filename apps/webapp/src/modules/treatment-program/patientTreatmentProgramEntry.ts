import { logger } from "@/infra/logging/logger";
import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { pickActivePlanInstance } from "./pickActivePlanInstance";
import { SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE } from "./instance-service";
import type { TreatmentProgramInstanceSummary } from "./types";

export type PatientTreatmentProgramEntryDeps = Pick<
  ReturnType<typeof buildAppDeps>,
  "treatmentProgramInstance" | "treatmentProgram" | "systemSettings"
>;

export type PatientTreatmentProgramEntryResult =
  | { kind: "redirect"; instanceId: string }
  | {
      kind: "list";
      archived: TreatmentProgramInstanceSummary[];
      promoEnsureFailed: boolean;
    };

async function tryEnsureDefaultPromoInstanceId(
  deps: PatientTreatmentProgramEntryDeps,
  patientUserId: string,
): Promise<string | null> {
  const promoTplId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
  if (!promoTplId?.trim()) return null;

  try {
    const tpl = await deps.treatmentProgram.getTemplate(promoTplId);
    if (tpl.status !== "published") return null;
    const ensured = await deps.treatmentProgramInstance.ensureDefaultPromoProgramForPatient({
      patientUserId,
    });
    return ensured.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE) {
      const list = await deps.treatmentProgramInstance.listForPatient(patientUserId);
      const active = pickActivePlanInstance(list);
      if (active) return active.id;
    }
    logger.warn({
      scope: "patient_treatment_entry",
      event: "ensure_default_promo_failed",
      patientUserId,
      error: msg,
    });
    return null;
  }
}

/**
 * Куда вести пациента с «Упражнения» / legacy promo: active → ensure promo → список (без авто-открытия завершённой).
 */
export async function resolvePatientTreatmentProgramEntry(
  deps: PatientTreatmentProgramEntryDeps,
  patientUserId: string,
): Promise<PatientTreatmentProgramEntryResult> {
  const list = await deps.treatmentProgramInstance.listForPatient(patientUserId);

  const active = pickActivePlanInstance(list);
  if (active) {
    return { kind: "redirect", instanceId: active.id };
  }

  const archived = list
    .filter((p) => p.status === "completed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));

  const promoTplId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
  let promoEnsureFailed = false;
  if (promoTplId?.trim()) {
    const ensuredId = await tryEnsureDefaultPromoInstanceId(deps, patientUserId);
    if (ensuredId) {
      return { kind: "redirect", instanceId: ensuredId };
    }
    promoEnsureFailed = true;
  }

  return { kind: "list", archived, promoEnsureFailed };
}

/** Active program for reminders / go-targets (promo materialized when needed). */
export async function resolveActiveTreatmentProgramInstanceId(
  deps: PatientTreatmentProgramEntryDeps,
  patientUserId: string,
): Promise<string | null> {
  const list = await deps.treatmentProgramInstance.listForPatient(patientUserId);
  const active = pickActivePlanInstance(list);
  if (active) return active.id;
  return tryEnsureDefaultPromoInstanceId(deps, patientUserId);
}
