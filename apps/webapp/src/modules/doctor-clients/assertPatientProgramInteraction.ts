import type { PatientProgramInteractionPolicy } from "./supportPolicy";

export type PatientProgramInteractionPolicyDeps = {
  doctorClients: {
    getPatientProgramInteractionPolicy: (
      patientUserId: string,
      context?: { organizationId: string },
    ) => Promise<PatientProgramInteractionPolicy>;
  };
};

export async function assertPatientProgramCommentsAllowed(
  deps: PatientProgramInteractionPolicyDeps,
  patientUserId: string,
  context?: { organizationId: string },
): Promise<
  | { ok: true; policy: PatientProgramInteractionPolicy }
  | { ok: false; error: "patient_support_comments_disabled" }
> {
  const policy = await deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId, context);
  if (!policy.commentsAllowed) {
    return { ok: false, error: "patient_support_comments_disabled" };
  }
  return { ok: true, policy };
}

export async function assertPatientProgramMediaAllowed(
  deps: PatientProgramInteractionPolicyDeps,
  patientUserId: string,
  context?: { organizationId: string },
): Promise<
  | { ok: true; policy: PatientProgramInteractionPolicy }
  | { ok: false; error: "patient_support_media_disabled" }
> {
  const policy = await deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId, context);
  if (!policy.mediaAllowed) {
    return { ok: false, error: "patient_support_media_disabled" };
  }
  return { ok: true, policy };
}
