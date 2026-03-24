import type { DoctorNoteRow, DoctorNotesPort } from "@/modules/doctor-notes/ports";

const notes: DoctorNoteRow[] = [];

export const inMemoryDoctorNotesPort: DoctorNotesPort = {
  async listForUser(userId: string): Promise<DoctorNoteRow[]> {
    return notes.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(params: { userId: string; authorId: string; text: string }): Promise<DoctorNoteRow> {
    const now = new Date().toISOString();
    const row: DoctorNoteRow = {
      id: crypto.randomUUID(),
      userId: params.userId,
      authorId: params.authorId,
      text: params.text,
      createdAt: now,
      updatedAt: now,
    };
    notes.push(row);
    return row;
  },
};
