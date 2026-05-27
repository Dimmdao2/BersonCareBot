/** Суффикс в `user.state` для ответа на наблюдение пациента по пункту программы (см. webapp `programNoteReplyContext`). */
export const PROGRAM_NOTE_REPLY_STATE_SUFFIX = '#pn:';

export function buildProgramNoteReplyState(integratorConversationId: string, stageItemId: string): string {
  return `admin_reply:${integratorConversationId.trim()}${PROGRAM_NOTE_REPLY_STATE_SUFFIX}${stageItemId.trim()}`;
}
