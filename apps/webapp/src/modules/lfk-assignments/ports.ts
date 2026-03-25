import type { AssignTemplateResult } from "./types";

export type LfkAssignmentsPort = {
  assignPublishedTemplateToPatient(params: {
    templateId: string;
    patientUserId: string;
    assignedBy: string | null;
  }): Promise<AssignTemplateResult>;
};
