import type { LfkAssignmentsPort } from "./ports";

export function createLfkAssignmentsService(port: LfkAssignmentsPort) {
  return {
    async assignTemplateToPatient(params: {
      templateId: string;
      patientUserId: string;
      assignedBy: string | null;
    }) {
      const tid = params.templateId?.trim();
      const pid = params.patientUserId?.trim();
      if (!tid || !pid) {
        throw new Error("Некорректные идентификаторы");
      }
      return port.assignPublishedTemplateToPatient({
        templateId: tid,
        patientUserId: pid,
        assignedBy: params.assignedBy,
      });
    },
  };
}

export type LfkAssignmentsService = ReturnType<typeof createLfkAssignmentsService>;
