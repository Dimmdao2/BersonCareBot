import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  patientProgramCommentsInteractionEnabled,
  patientProgramMediaInteractionEnabled,
} from "@/modules/doctor-clients/patientProgramInteractionAccess";

export type PatientProgramInteractionBundle = {
  comments: { visible: boolean; enabled: boolean };
  media: { visible: boolean; enabled: boolean };
};

export async function loadPatientProgramInteractionBundle(
  deps: ReturnType<typeof buildAppDeps>,
  patientUserId: string,
  organizationId: string,
  assignmentSource: string,
): Promise<PatientProgramInteractionBundle> {
  const [policy, adminDiscussionUiEnabled, adminMediaSubmissionEnabled] = await Promise.all([
    deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId, { organizationId }),
    deps.runtimeConfig.getBoolean("patient_program_discussion_ui_enabled", {
      patientUserId,
      organizationId,
    }),
    deps.runtimeConfig.getBoolean("patient_program_discussion_media_submission_enabled", {
      patientUserId,
      organizationId,
    }),
  ]);

  return {
    comments: patientProgramCommentsInteractionEnabled({
      policy,
      assignmentSource,
      adminDiscussionUiEnabled,
    }),
    media: patientProgramMediaInteractionEnabled({
      policy,
      assignmentSource,
      adminDiscussionUiEnabled,
      adminMediaSubmissionEnabled,
    }),
  };
}
