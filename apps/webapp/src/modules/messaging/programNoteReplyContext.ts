export type ProgramNoteReplyContext = {
  organizationId: string;
  platformUserId: string;
  stageItemId: string;
  exerciseTitle: string;
  integratorConversationId: string;
  assignmentSource: string;
  itemStatus: string;
};

export function exerciseTitleFromSnapshot(snapshot: unknown): string {
  if (snapshot && typeof snapshot === 'object' && 'title' in snapshot) {
    const title = (snapshot as { title?: unknown }).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return 'Пункт программы';
}

export function formatPatientExerciseCommentReplyText(input: {
  exerciseTitle: string;
  doctorText: string;
}): string {
  const title = input.exerciseTitle.trim() || 'Пункт программы';
  const body = input.doctorText.trim();
  return `${patientExerciseCommentReplyPrefix(title)}\n\n${body}`;
}

export function patientExerciseCommentReplyPrefix(exerciseTitle: string): string {
  const title = exerciseTitle.trim() || 'Пункт программы';
  return `Ответ на ваш комментарий к упражнению «${title}»:`;
}

export function extractPatientExerciseCommentReplyBody(input: {
  exerciseTitle: string;
  messageText: string;
}): string | null {
  const prefix = patientExerciseCommentReplyPrefix(input.exerciseTitle);
  const text = input.messageText;
  if (!text.startsWith(prefix)) return null;
  const body = text.slice(prefix.length).trim();
  if (body.length === 0) return null;
  return body;
}

const PROGRAM_NOTE_REPLY_TITLE_RE = /^Ответ на ваш комментарий к упражнению «([^»]+)»:/;

/** Legacy support-chat reply: extract exercise title from prefixed admin message. */
export function parseExerciseTitleFromProgramNoteReplyMessage(messageText: string): string | null {
  const match = messageText.match(PROGRAM_NOTE_REPLY_TITLE_RE);
  const title = match?.[1]?.trim();
  return title && title.length > 0 ? title : null;
}
