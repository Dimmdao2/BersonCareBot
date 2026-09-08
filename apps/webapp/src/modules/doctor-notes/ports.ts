export type DoctorNoteRow = {
  id: string;
  organizationId?: string | null;
  userId: string;
  authorId: string;
  noteDate: string;
  text: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type DoctorNotesPort = {
  listForUser(userId: string, authorId: string): Promise<DoctorNoteRow[]>;
  saveDaily(params: {
    userId: string;
    authorId: string;
    noteDate: string;
    text: string;
    expectedRevision?: number;
  }): Promise<{ kind: 'saved'; note: DoctorNoteRow } | { kind: 'conflict'; note: DoctorNoteRow }>;
};
