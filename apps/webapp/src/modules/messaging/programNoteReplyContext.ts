import { eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  treatmentProgramInstanceStageItems,
  treatmentProgramInstanceStages,
  treatmentProgramInstances,
} from "../../../db/schema/treatmentProgramInstances";
import { webappPlatformConversationId } from "@/modules/messaging/supportConversationIds";

export const PROGRAM_NOTE_REPLY_STATE_SUFFIX = "#pn:";

export type ProgramNoteReplyContext = {
  platformUserId: string;
  stageItemId: string;
  exerciseTitle: string;
  integratorConversationId: string;
  programNoteReplyState: string;
};

export function buildProgramNoteReplyState(integratorConversationId: string, stageItemId: string): string {
  return `admin_reply:${integratorConversationId}${PROGRAM_NOTE_REPLY_STATE_SUFFIX}${stageItemId}`;
}

export function exerciseTitleFromSnapshot(snapshot: unknown): string {
  if (snapshot && typeof snapshot === "object" && "title" in snapshot) {
    const title = (snapshot as { title?: unknown }).title;
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  return "Пункт программы";
}

export async function resolveProgramNoteReplyContext(
  stageItemId: string,
): Promise<ProgramNoteReplyContext | null> {
  const id = stageItemId.trim();
  if (!id) return null;

  const db = getDrizzle();
  const rows = await db
    .select({
      patientUserId: treatmentProgramInstances.patientUserId,
      snapshot: treatmentProgramInstanceStageItems.snapshot,
    })
    .from(treatmentProgramInstanceStageItems)
    .innerJoin(
      treatmentProgramInstanceStages,
      eq(treatmentProgramInstanceStageItems.stageId, treatmentProgramInstanceStages.id),
    )
    .innerJoin(
      treatmentProgramInstances,
      eq(treatmentProgramInstanceStages.instanceId, treatmentProgramInstances.id),
    )
    .where(eq(treatmentProgramInstanceStageItems.id, id))
    .limit(1);

  const row = rows[0];
  if (!row?.patientUserId) return null;

  const integratorConversationId = webappPlatformConversationId(row.patientUserId);
  return {
    platformUserId: row.patientUserId,
    stageItemId: id,
    exerciseTitle: exerciseTitleFromSnapshot(row.snapshot),
    integratorConversationId,
    programNoteReplyState: buildProgramNoteReplyState(integratorConversationId, id),
  };
}

export function formatPatientExerciseCommentReplyText(input: {
  exerciseTitle: string;
  doctorText: string;
}): string {
  const title = input.exerciseTitle.trim() || "Пункт программы";
  const body = input.doctorText.trim();
  return `Ответ на ваш комментарий к упражнению «${title}»:\n\n${body}`;
}
