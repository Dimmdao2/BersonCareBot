import type { PatientProgramInteractionPolicy } from "./supportPolicy";

/** Patient UI/API: show discussion controls (still may be disabled). */
export function patientProgramDiscussionControlsVisible(params: {
  assignmentSource: string;
  adminDiscussionUiEnabled: boolean;
}): boolean {
  return params.assignmentSource === "doctor" && params.adminDiscussionUiEnabled;
}

export function patientProgramCommentsInteractionEnabled(params: {
  policy: PatientProgramInteractionPolicy;
  assignmentSource: string;
  adminDiscussionUiEnabled: boolean;
}): { visible: boolean; enabled: boolean } {
  const visible = patientProgramDiscussionControlsVisible({
    assignmentSource: params.assignmentSource,
    adminDiscussionUiEnabled: params.adminDiscussionUiEnabled,
  });
  return {
    visible,
    enabled: visible && params.policy.commentsAllowed,
  };
}

export function patientProgramMediaInteractionEnabled(params: {
  policy: PatientProgramInteractionPolicy;
  assignmentSource: string;
  adminDiscussionUiEnabled: boolean;
  adminMediaSubmissionEnabled: boolean;
}): { visible: boolean; enabled: boolean } {
  const visible = patientProgramDiscussionControlsVisible({
    assignmentSource: params.assignmentSource,
    adminDiscussionUiEnabled: params.adminDiscussionUiEnabled,
  });
  return {
    visible: visible && params.adminMediaSubmissionEnabled,
    enabled:
      visible &&
      params.adminMediaSubmissionEnabled &&
      params.policy.mediaAllowed,
  };
}
