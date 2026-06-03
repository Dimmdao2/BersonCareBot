import type { ProgramItemDiscussionService } from "./service";
import {
  listDiscussionPageMerged,
  paginateMergedMessages,
} from "./listDiscussionPage";
import type {
  ProgramItemDiscussionMessage,
  ProgramItemDiscussionMessageCursor,
} from "./types";

export type InstanceDiscussionItemRef = {
  stageItemId: string;
  exerciseTitle: string;
};

/** Merged discussion page across instance items; optional single-item filter. */
export async function listInstanceDiscussionPageMerged(input: {
  discussion: ProgramItemDiscussionService;
  items: InstanceDiscussionItemRef[];
  patientUserId: string;
  stageItemIdFilter: string | null;
  limit: number;
  direction: "backward" | "forward";
  cursor: ProgramItemDiscussionMessageCursor | null;
}): Promise<{
  page: ProgramItemDiscussionMessage[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}> {
  const targetItems =
    input.stageItemIdFilter != null
      ? input.items.filter((item) => item.stageItemId === input.stageItemIdFilter)
      : input.items;

  if (targetItems.length === 0) {
    return { page: [], nextCursor: null, hasMore: false, totalCount: 0 };
  }

  if (targetItems.length === 1) {
    const only = targetItems[0]!;
    return listDiscussionPageMerged({
      discussion: input.discussion,
      stageItemId: only.stageItemId,
      patientUserId: input.patientUserId,
      exerciseTitle: only.exerciseTitle,
      limit: input.limit,
      direction: input.direction,
      cursor: input.cursor,
    });
  }

  const pages = await Promise.all(
    targetItems.map((item) =>
      listDiscussionPageMerged({
        discussion: input.discussion,
        stageItemId: item.stageItemId,
        patientUserId: input.patientUserId,
        exerciseTitle: item.exerciseTitle,
        limit: input.limit,
        direction: input.direction,
        cursor: input.cursor,
      }),
    ),
  );

  const mergedMessages = pages.flatMap((page) => page.page);
  const { page, nextCursor, hasMore } = paginateMergedMessages({
    messages: mergedMessages,
    limit: input.limit,
    direction: input.direction,
    cursor: input.cursor,
  });

  const totalCount = pages.reduce((sum, entry) => sum + entry.totalCount, 0);
  const hasMoreMerged = hasMore || pages.some((entry) => entry.hasMore);

  return {
    page,
    nextCursor,
    hasMore: hasMoreMerged,
    totalCount,
  };
}
