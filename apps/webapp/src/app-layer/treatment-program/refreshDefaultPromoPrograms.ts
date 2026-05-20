import { revalidatePatientTreatmentProgramUi } from "@/app-layer/cache/revalidatePatientTreatmentProgramUi";
import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";

type AppDeps = ReturnType<typeof buildAppDeps>;

export async function refreshDefaultPromoPrograms(deps: AppDeps, actorUserId: string | null) {
  const result = await deps.treatmentProgramInstance.refreshActivePromoProgramsFromDefaultTemplate({
    actorUserId,
  });

  for (const pair of result.pairs) {
    await deps.reminders.retargetRehabProgramInstanceLinkedId(
      pair.patientUserId,
      pair.oldInstanceId,
      pair.newInstanceId,
    );
  }

  if (result.refreshedCount > 0) {
    revalidatePatientTreatmentProgramUi();
  }

  return result;
}
