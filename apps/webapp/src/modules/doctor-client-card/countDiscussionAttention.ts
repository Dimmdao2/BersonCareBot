import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";

/**
 * Элемент требует внимания врача, если последнее сообщение в обсуждении — от пациента
 * (нет ответа врача «поверх»). См. LOG инициативы CARD_REDESIGN 2B-3.
 */
export function countDiscussionAttentionFromMessages(
  messages: ProgramItemDiscussionMessage[],
): { comments: number; media: number } {
  if (messages.length === 0) return { comments: 0, media: 0 };
  const sorted = [...messages].sort((a, b) => {
    const byDate = a.createdAt.localeCompare(b.createdAt);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
  const last = sorted[sorted.length - 1];
  if (last.senderRole !== "patient") return { comments: 0, media: 0 };
  if (last.mediaFileId) return { comments: 0, media: 1 };
  return { comments: 1, media: 0 };
}
