import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function assertPatientProgramCommentsAllowed(
  deps: ReturnType<typeof buildAppDeps>,
  patientUserId: string,
): Promise<{ ok: true } | { ok: false; error: "patient_support_comments_disabled" }> {
  const policy = await deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId);
  if (!policy.commentsAllowed) {
    return { ok: false, error: "patient_support_comments_disabled" };
  }
  return { ok: true };
}

export async function assertPatientProgramMediaAllowed(
  deps: ReturnType<typeof buildAppDeps>,
  patientUserId: string,
): Promise<{ ok: true } | { ok: false; error: "patient_support_media_disabled" }> {
  const policy = await deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId);
  if (!policy.mediaAllowed) {
    return { ok: false, error: "patient_support_media_disabled" };
  }
  return { ok: true };
}
