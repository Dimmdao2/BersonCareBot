import type { TodayExerciseCommentAttentionItem } from '../loadDoctorExerciseCommentAttention';

export type ExerciseCommentAttentionPatientGroup = {
  patientUserId: string;
  patientDisplayName: string;
  items: TodayExerciseCommentAttentionItem[];
};

/** Groups unread exercise threads by patient and keeps the newest thread first. */
export function groupExerciseCommentAttentionByPatient(
  items: TodayExerciseCommentAttentionItem[],
): ExerciseCommentAttentionPatientGroup[] {
  const groups = new Map<string, ExerciseCommentAttentionPatientGroup>();
  for (const row of items) {
    const current = groups.get(row.patientUserId);
    if (current) {
      current.items.push(row);
    } else {
      groups.set(row.patientUserId, {
        patientUserId: row.patientUserId,
        patientDisplayName: row.patientDisplayName,
        items: [row],
      });
    }
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => b.latestMessage.createdAt.localeCompare(a.latestMessage.createdAt));
  }
  return [...groups.values()].sort((a, b) =>
    a.patientDisplayName.localeCompare(b.patientDisplayName, 'ru', { sensitivity: 'base' }),
  );
}
