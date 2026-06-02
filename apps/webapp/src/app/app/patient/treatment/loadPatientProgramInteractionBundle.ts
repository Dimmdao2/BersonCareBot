import type { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  patientProgramCommentsInteractionEnabled,
  patientProgramMediaInteractionEnabled,
} from "@/modules/doctor-clients/patientProgramInteractionAccess";
import { parseDoctorSupportDefaultEnabled } from "@/modules/doctor-clients/supportPolicy";

export type PatientProgramInteractionBundle = {
  comments: { visible: boolean; enabled: boolean };
  media: { visible: boolean; enabled: boolean };
};

function parseAdminDiscussionFlag(valueJson: unknown): boolean {
  return parseDoctorSupportDefaultEnabled(valueJson);
}

export async function loadPatientProgramInteractionBundle(
  deps: ReturnType<typeof buildAppDeps>,
  patientUserId: string,
  assignmentSource: string,
): Promise<PatientProgramInteractionBundle> {
  const [policy, discussionUiSetting, mediaUiSetting] = await Promise.all([
    deps.doctorClients.getPatientProgramInteractionPolicy(patientUserId),
    deps.systemSettings.getSetting("patient_program_discussion_ui_enabled", "admin"),
    deps.systemSettings.getSetting("patient_program_discussion_media_submission_enabled", "admin"),
  ]);
  const adminDiscussionUiEnabled = parseAdminDiscussionFlag(discussionUiSetting?.valueJson ?? null);
  const adminMediaSubmissionEnabled = parseAdminDiscussionFlag(mediaUiSetting?.valueJson ?? null);

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
