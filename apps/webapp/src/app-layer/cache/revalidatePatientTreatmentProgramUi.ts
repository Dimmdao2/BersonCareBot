import { revalidatePath } from "next/cache";
import { routePaths } from "@/app-layer/routes/paths";

/** A5: сброс кэша RSC Today и списка программ после мутаций плана / mark-viewed / plan-opened. */
export function revalidatePatientTreatmentProgramUi(): void {
  revalidatePath(routePaths.patient);
  revalidatePath(routePaths.patientTreatmentPrograms);
}
