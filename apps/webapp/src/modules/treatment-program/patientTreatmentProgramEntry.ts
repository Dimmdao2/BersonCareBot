import { logger } from '@/infra/logging/logger';
import { pickActivePlanInstance } from './pickActivePlanInstance';
import { SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE } from './instance-service';
import type { TreatmentProgramInstanceSummary } from './types';

export type PatientTreatmentProgramEntryDeps = {
  treatmentProgramInstance: {
    listForPatient(patientUserId: string): Promise<TreatmentProgramInstanceSummary[]>;
    ensureDefaultPromoProgramForPatient(params: { patientUserId: string }): Promise<{ id: string }>;
  };
  treatmentProgram: {
    getTemplate(id: string): Promise<{ status: string } | null>;
  };
  systemSettings: {
    getPatientDefaultPromoTreatmentProgramTemplateId(): Promise<string | null>;
  };
};

export type PatientTreatmentProgramEntryResult =
  | { kind: 'redirect'; instanceId: string }
  | {
      kind: 'list';
      archived: TreatmentProgramInstanceSummary[];
      promoEnsureFailed: boolean;
    };

async function tryEnsureDefaultPromoInstanceId(
  deps: PatientTreatmentProgramEntryDeps,
  patientUserId: string,
  canMaterializePromo: () => Promise<boolean>,
): Promise<{ instanceId: string | null; refused: boolean }> {
  const promoTplId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
  if (!promoTplId?.trim()) return { instanceId: null, refused: false };

  try {
    const tpl = await deps.treatmentProgram.getTemplate(promoTplId);
    if (!tpl || tpl.status !== 'published') return { instanceId: null, refused: false };
    if (!(await canMaterializePromo())) return { instanceId: null, refused: true };
    const ensured = await deps.treatmentProgramInstance.ensureDefaultPromoProgramForPatient({
      patientUserId,
    });
    return { instanceId: ensured.id, refused: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE) {
      const list = await deps.treatmentProgramInstance.listForPatient(patientUserId);
      const active = pickActivePlanInstance(list);
      if (active) return { instanceId: active.id, refused: false };
    }
    logger.warn({
      scope: 'patient_treatment_entry',
      event: 'ensure_default_promo_failed',
      patientUserId,
      error: msg,
    });
    return { instanceId: null, refused: false };
  }
}

/**
 * Куда вести пациента с «Упражнения» / legacy promo: active → ensure promo → список (без авто-открытия завершённой).
 */
export async function resolvePatientTreatmentProgramEntry(
  deps: PatientTreatmentProgramEntryDeps,
  patientUserId: string,
  canMaterializePromo: () => Promise<boolean>,
): Promise<PatientTreatmentProgramEntryResult> {
  const list = await deps.treatmentProgramInstance.listForPatient(patientUserId);

  const active = pickActivePlanInstance(list);
  if (active) {
    return { kind: 'redirect', instanceId: active.id };
  }

  const archived = list
    .filter((p) => p.status === 'completed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));

  const promoTplId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
  let promoEnsureFailed = false;
  if (promoTplId?.trim()) {
    const ensured = await tryEnsureDefaultPromoInstanceId(deps, patientUserId, canMaterializePromo);
    if (ensured.instanceId) {
      return { kind: 'redirect', instanceId: ensured.instanceId };
    }
    promoEnsureFailed = !ensured.refused;
  }

  return { kind: 'list', archived, promoEnsureFailed };
}

/** Active program for reminders / go-targets (promo materialized when needed). */
export async function resolveActiveTreatmentProgramInstanceId(
  deps: PatientTreatmentProgramEntryDeps,
  patientUserId: string,
  canMaterializePromo: () => Promise<boolean>,
): Promise<string | null> {
  const list = await deps.treatmentProgramInstance.listForPatient(patientUserId);
  const active = pickActivePlanInstance(list);
  if (active) return active.id;
  return (await tryEnsureDefaultPromoInstanceId(deps, patientUserId, canMaterializePromo))
    .instanceId;
}
