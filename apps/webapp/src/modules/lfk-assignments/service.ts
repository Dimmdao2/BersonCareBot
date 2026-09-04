import type { LfkAssignmentsPort } from './ports';
import { UserFacingError } from '@/shared/errors/userFacingError';

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
        throw new UserFacingError('Некорректные идентификаторы');
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
