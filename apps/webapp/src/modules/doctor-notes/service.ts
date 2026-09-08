import type { DoctorNotesPort } from './ports';

export function createDoctorNotesService(port: DoctorNotesPort) {
  return {
    listForUser(userId: string, authorId: string) {
      return port.listForUser(userId, authorId);
    },
    saveDaily(params: {
      userId: string;
      authorId: string;
      noteDate: string;
      text: string;
      expectedRevision?: number;
    }) {
      return port.saveDaily(params);
    },
  };
}
