export type DoctorNoteRow = {
  id: string;
  userId: string;
  authorId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type DoctorNotesPort = {
  listForUser(userId: string): Promise<DoctorNoteRow[]>;
  create(params: { userId: string; authorId: string; text: string }): Promise<DoctorNoteRow>;
};
