/** Маркер `symptom_entries.notes` для instant-записи «Общее», продублированной из отметки после разминки. */
export const WELLBEING_GENERAL_MIRROR_NOTE = "__bcc_warmup_general_mirror__";

export function isWellbeingGeneralMirrorNote(notes: string | null | undefined): boolean {
  return notes === WELLBEING_GENERAL_MIRROR_NOTE;
}
