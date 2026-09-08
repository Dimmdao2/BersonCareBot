/**
 * Единственная точка, где решается видимость отслеживания симптома пациенту в момент его создания
 * врачом. Один и тот же ответ нужен двум входам: вкладке «Симптомы дневника»
 * (`/api/doctor/clients/:userId/symptom-trackings`) и клиническому мосту жалоба → отслеживание
 * (жалоба из карты и жалоба из приёма). Держать расчёт в двух местах нельзя: разъедутся, и часть
 * симптомов молча перестанет доходить до пациента.
 *
 * Настройка арендатора (`patientSymptomTrackingDefault`) описывает режим, а не конечное значение:
 * `on_support` зависит ещё и от того, ведётся ли пациент на сопровождении.
 */
import type { WorkspaceClientDefaultMode } from '@/modules/system-settings/doctorWorkspaceComposition';

/** Чистое правило режима: что значит `off` / `all` / `on_support` для конкретного пациента. */
export function patientSymptomTrackingDefaultForMode(
  mode: WorkspaceClientDefaultMode,
  onSupport: boolean,
): boolean {
  return mode === 'all' || (mode === 'on_support' && onSupport);
}

type VisibilityDeps = {
  systemSettings: {
    getDoctorWorkspaceClientDefaults: (options: {
      organizationId: string;
    }) => Promise<{ patientSymptomTrackingDefault: WorkspaceClientDefaultMode }>;
  };
  doctorClients: {
    getClientSupport: (
      patientUserId: string,
      organizationId: string,
    ) => Promise<{ onSupport?: boolean } | null>;
  };
};

/**
 * Значение `patient_tracking_enabled` по умолчанию для нового отслеживания пациента.
 * Вызывать под принципалом рабочего места врача (обе чтения — арендатор-scoped).
 */
export async function resolvePatientSymptomTrackingDefault(
  deps: VisibilityDeps,
  params: { organizationId: string; patientUserId: string },
): Promise<boolean> {
  const [defaults, support] = await Promise.all([
    deps.systemSettings.getDoctorWorkspaceClientDefaults({
      organizationId: params.organizationId,
    }),
    deps.doctorClients.getClientSupport(params.patientUserId, params.organizationId),
  ]);
  return patientSymptomTrackingDefaultForMode(
    defaults.patientSymptomTrackingDefault,
    support?.onSupport === true,
  );
}
