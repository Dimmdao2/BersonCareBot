import {
  exerciseTitleFromSnapshot,
  type ProgramNoteReplyContext,
} from '@/modules/messaging/programNoteReplyContext';
import { webappPlatformConversationId } from '@/modules/messaging/supportConversationIds';
import { loadProgramNoteReplyContextRow } from '@/infra/repos/pgProgramNoteReplyContext';

export async function resolveProgramNoteReplyContext(
  stageItemId: string,
): Promise<ProgramNoteReplyContext | null> {
  const id = stageItemId.trim();
  if (!id) return null;

  const row = await loadProgramNoteReplyContextRow(id);
  if (!row) return null;

  const integratorConversationId = webappPlatformConversationId(row.patientUserId);
  return {
    organizationId: row.organizationId!,
    platformUserId: row.patientUserId,
    stageItemId: id,
    exerciseTitle: exerciseTitleFromSnapshot(row.snapshot),
    integratorConversationId,
    assignmentSource: row.assignmentSource,
    itemStatus: row.itemStatus,
  };
}
