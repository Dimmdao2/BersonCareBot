import type { DoctorNotesPort } from "./ports";

export function createDoctorNotesService(port: DoctorNotesPort) {
  return {
    listForUser(userId: string) {
      return port.listForUser(userId);
    },
    create(params: { userId: string; authorId: string; text: string }) {
      const trimmed = params.text.trim();
      if (!trimmed) {
        return Promise.reject(new Error("empty_note"));
      }
      return port.create({ ...params, text: trimmed });
    },
  };
}
