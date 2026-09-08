import type { DoctorNoteRow, DoctorNotesPort } from '@/modules/doctor-notes/ports';

const notes: DoctorNoteRow[] = [];

export const inMemoryDoctorNotesPort: DoctorNotesPort = {
  async listForUser(userId: string, authorId: string): Promise<DoctorNoteRow[]> {
    return notes
      .filter((n) => n.userId === userId && n.authorId === authorId)
      .sort((a, b) => b.noteDate.localeCompare(a.noteDate));
  },

  async saveDaily(params) {
    const existing = notes.find(
      (note) =>
        note.userId === params.userId &&
        note.authorId === params.authorId &&
        note.noteDate === params.noteDate,
    );
    if (existing) {
      if (params.expectedRevision !== existing.revision)
        return { kind: 'conflict' as const, note: existing };
      existing.text = params.text;
      existing.revision += 1;
      existing.updatedAt = new Date().toISOString();
      return { kind: 'saved' as const, note: existing };
    }
    const now = new Date().toISOString();
    const row: DoctorNoteRow = {
      id: crypto.randomUUID(),
      userId: params.userId,
      authorId: params.authorId,
      noteDate: params.noteDate,
      text: params.text,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
    notes.push(row);
    return { kind: 'saved' as const, note: row };
  },
};
