import type { PatientVisibilityLinkPort } from '@/modules/patient-visibility/ports';

type LinkRow = {
  organizationId: string;
  patientUserId: string;
  specialistId: string;
  status: 'active' | 'ended';
};

const rows: LinkRow[] = [];

export function resetInMemoryPatientVisibilityLinksForTests(nextRows: LinkRow[] = []): void {
  rows.length = 0;
  rows.push(...nextRows);
}

export function createInMemoryPatientVisibilityLinkPort(): PatientVisibilityLinkPort {
  return {
    async hasActiveLink({ organizationId, patientUserId, specialistId }) {
      return rows.some(
        (row) =>
          row.organizationId === organizationId &&
          row.patientUserId === patientUserId &&
          row.specialistId === specialistId &&
          row.status === 'active',
      );
    },

    async createLinkIfAbsent({ organizationId, patientUserId, specialistId }) {
      const exists = rows.some(
        (row) => row.patientUserId === patientUserId && row.specialistId === specialistId,
      );
      if (exists) {
        return { created: false };
      }
      rows.push({ organizationId, patientUserId, specialistId, status: 'active' });
      return { created: true };
    },
  };
}
