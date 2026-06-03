import type { ProgramItemDiscussionService } from "./service";
import type {
  ProgramItemDiscussionMessage,
  ProgramItemDiscussionMessageCursor,
} from "./types";

const MERGE_WINDOW_CAP = 200;

export function compareDiscussionMessages(
  a: Pick<ProgramItemDiscussionMessage, "createdAt" | "id">,
  b: Pick<ProgramItemDiscussionMessage, "createdAt" | "id">,
): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

export function paginateMergedMessages(params: {
  messages: ProgramItemDiscussionMessage[];
  limit: number;
  direction: "backward" | "forward";
  cursor: ProgramItemDiscussionMessageCursor | null;
}): {
  page: ProgramItemDiscussionMessage[];
  nextCursor: string | null;
  hasMore: boolean;
} {
  const { messages, limit, direction, cursor } = params;
  const sorted = [...messages].sort(compareDiscussionMessages);
  if (sorted.length === 0) {
    return { page: [], nextCursor: null, hasMore: false };
  }

  const encodeCursor = (message: Pick<ProgramItemDiscussionMessage, "createdAt" | "id">) =>
    Buffer.from(JSON.stringify({ createdAt: message.createdAt, id: message.id }), "utf8").toString("base64url");

  if (direction === "forward") {
    let start = 0;
    if (cursor) {
      while (
        start < sorted.length &&
        compareDiscussionMessages(sorted[start]!, { createdAt: cursor.createdAt, id: cursor.id }) <= 0
      ) {
        start += 1;
      }
    }
    const end = Math.min(sorted.length, start + limit);
    const page = sorted.slice(start, end);
    const hasMore = end < sorted.length;
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null;
    return { page, nextCursor, hasMore };
  }

  let endExclusive = sorted.length;
  if (cursor) {
    endExclusive = 0;
    while (
      endExclusive < sorted.length &&
      compareDiscussionMessages(sorted[endExclusive]!, { createdAt: cursor.createdAt, id: cursor.id }) < 0
    ) {
      endExclusive += 1;
    }
  }
  const start = Math.max(0, endExclusive - limit);
  const page = sorted.slice(start, endExclusive);
  const hasMore = start > 0;
  const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[0]!) : null;
  return { page, nextCursor, hasMore };
}

export async function listDiscussionPageMerged(input: {
  discussion: ProgramItemDiscussionService;
  stageItemId: string;
  patientUserId: string;
  exerciseTitle: string;
  limit: number;
  direction: "backward" | "forward";
  cursor: ProgramItemDiscussionMessageCursor | null;
}): Promise<{
  page: ProgramItemDiscussionMessage[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}> {
  const windowSize = Math.min(Math.max(input.limit * 4, input.limit + 20), MERGE_WINDOW_CAP);

  const [dbPage, dbCount, excludeSupportMessageIds] = await Promise.all([
    input.discussion.listMessagesPage({
      stageItemId: input.stageItemId,
      limit: windowSize,
      direction: input.direction,
      cursor: input.cursor,
    }),
    input.discussion.countMessagesForItem(input.stageItemId),
    input.discussion.listLinkedSupportMessageIdsForStageItem(input.stageItemId),
  ]);

  const legacyCount = await input.discussion.countLegacyAdminRepliesForStageItem({
    patientUserId: input.patientUserId,
    stageItemId: input.stageItemId,
    exerciseTitle: input.exerciseTitle,
    excludeSupportMessageIds,
    requireUniqueStageItemAttribution: true,
  });

  const legacy = await input.discussion.mergeLegacyAdminReplies({
    patientUserId: input.patientUserId,
    stageItemId: input.stageItemId,
    exerciseTitle: input.exerciseTitle,
    excludeSupportMessageIds,
    limit: windowSize,
    offset: 0,
    requireUniqueStageItemAttribution: true,
  });

  const mergedWindow = [...dbPage, ...legacy];
  const { page, nextCursor, hasMore } = paginateMergedMessages({
    messages: mergedWindow,
    limit: input.limit,
    direction: input.direction,
    cursor: input.cursor,
  });

  return {
    page,
    nextCursor,
    hasMore,
    totalCount: dbCount + legacyCount,
  };
}

export async function getDiscussionSummaryForItem(input: {
  discussion: ProgramItemDiscussionService;
  stageItemId: string;
  patientUserId: string;
  exerciseTitle: string;
}): Promise<{
  totalCount: number;
  lastMessage: ProgramItemDiscussionMessage | null;
}> {
  const [dbCount, excludeSupportMessageIds] = await Promise.all([
    input.discussion.countMessagesForItem(input.stageItemId),
    input.discussion.listLinkedSupportMessageIdsForStageItem(input.stageItemId),
  ]);
  const legacyCount = await input.discussion.countLegacyAdminRepliesForStageItem({
    patientUserId: input.patientUserId,
    stageItemId: input.stageItemId,
    exerciseTitle: input.exerciseTitle,
    excludeSupportMessageIds,
    requireUniqueStageItemAttribution: true,
  });
  const totalCount = dbCount + legacyCount;

  const [dbLatest, legacyLatest] = await Promise.all([
    input.discussion.listMessagesPage({
      stageItemId: input.stageItemId,
      limit: 1,
      direction: "backward",
      cursor: null,
    }),
    legacyCount > 0
      ? input.discussion.mergeLegacyAdminReplies({
          patientUserId: input.patientUserId,
          stageItemId: input.stageItemId,
          exerciseTitle: input.exerciseTitle,
          excludeSupportMessageIds,
          limit: 1,
          offset: legacyCount - 1,
          requireUniqueStageItemAttribution: true,
        })
      : Promise.resolve([]),
  ]);

  const candidates = [...dbLatest, ...legacyLatest];
  if (candidates.length === 0) {
    return { totalCount, lastMessage: null };
  }
  const lastMessage = [...candidates].sort(compareDiscussionMessages)[candidates.length - 1]!;
  return { totalCount, lastMessage };
}
