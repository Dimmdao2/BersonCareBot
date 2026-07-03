import { eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  treatmentProgramInstanceStageItems,
  treatmentProgramInstanceStages,
  treatmentProgramInstances,
} from "../../../db/schema/treatmentProgramInstances";

export type ProgramNoteReplyContextRow = {
  patientUserId: string;
  assignmentSource: string;
  itemStatus: string;
  snapshot: unknown;
};

export async function loadProgramNoteReplyContextRow(
  stageItemId: string,
): Promise<ProgramNoteReplyContextRow | null> {
  const db = getDrizzle();
  const rows = await db
    .select({
      patientUserId: treatmentProgramInstances.patientUserId,
      assignmentSource: treatmentProgramInstances.assignmentSource,
      itemStatus: treatmentProgramInstanceStageItems.status,
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
    .where(eq(treatmentProgramInstanceStageItems.id, stageItemId))
    .limit(1);

  const row = rows[0];
  return row?.patientUserId ? row : null;
}
