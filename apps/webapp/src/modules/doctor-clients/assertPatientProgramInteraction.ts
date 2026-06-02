import type { PatientProgramInteractionPolicy } from "./supportPolicy";

export type PatientProgramInteractionPolicyDeps = {
  doctorClients: {
    getPatientProgramInteractionPolicy: (
      patientUserId: string,
    ) => Promise<PatientProgramInteractionPolicy>;
  };
};

export async function assertPatientProgramCommentsAllowed(
  deps: PatientProgramInteractionPolicyDeps,
  patientUserId: string,
): Promise<{ ok: true } | { ok: false; error: "patient_support_comments_disabled" }> {
  const policy = await deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId);
  if (!policy.commentsAllowed) {
    return { ok: false, error: "patient_support_comments_disabled" };
  }
  return { ok: true };
}

export async function assertPatientProgramMediaAllowed(
  deps: PatientProgramInteractionPolicyDeps,
  patientUserId: string,
): Promise<{ ok: true } | { ok: false; error: "patient_support_media_disabled" }> {
  const policy = await deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId);
  if (!policy.mediaAllowed) {
    return { ok: false, error: "patient_support_media_disabled" };
  }
  return { ok: true };
}
