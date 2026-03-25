"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";

export async function assignLfkTemplateFromDoctor(
  patientUserId: string,
  templateId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireDoctorAccess();
    const deps = buildAppDeps();
    await deps.lfkAssignments.assignTemplateToPatient({
      templateId,
      patientUserId,
      assignedBy: session.user.userId,
    });
    revalidatePath(`/app/doctor/clients/${patientUserId}`);
    revalidatePath(routePaths.diary);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось назначить комплекс" };
  }
}
