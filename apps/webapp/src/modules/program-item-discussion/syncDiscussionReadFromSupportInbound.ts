import { parseExerciseTitleFromProgramNoteReplyMessage } from "@/modules/messaging/programNoteReplyContext";
import type { ProgramItemDiscussionPort } from "./ports";

export async function syncDiscussionReadFromSupportInboundMessages(input: {
  port: ProgramItemDiscussionPort;
  patientUserId: string;
  inboundAdminMessages: Array<{ id: string; text: string }>;
}): Promise<{ markedStageItemIds: string[]; skippedAmbiguous: number }> {
  const stageItemIds = new Set<string>();
  let skippedAmbiguous = 0;

  for (const msg of input.inboundAdminMessages) {
    const linked = await input.port.findStageItemIdBySupportMessageId(msg.id);
    if (linked) {
      stageItemIds.add(linked);
      continue;
    }

    const title = parseExerciseTitleFromProgramNoteReplyMessage(msg.text);
    if (!title) continue;

    const matches = await input.port.listStageItemIdsByExerciseTitleForPatient(input.patientUserId, title);
    if (matches.length === 1) {
      stageItemIds.add(matches[0]!);
    } else if (matches.length > 1) {
      skippedAmbiguous += 1;
      console.warn("[program-item-discussion] ambiguous legacy program note reply title", {
        title,
        patientUserId: input.patientUserId,
        supportMessageId: msg.id,
      });
    }
  }

  const markedStageItemIds = [...stageItemIds];
  await Promise.all(
    markedStageItemIds.map((stageItemId) =>
      input.port.markRead({
        patientUserId: input.patientUserId,
        stageItemId,
      }),
    ),
  );

  return { markedStageItemIds, skippedAmbiguous };
}
