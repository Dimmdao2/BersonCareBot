import { describe, expect, it, vi } from "vitest";
import { createProgramItemDiscussionService } from "./service";
import type { ProgramItemDiscussionPort } from "./ports";

describe("program item discussion service unread", () => {
  it("getUnreadCount includes legacy unread when exerciseTitle is provided", async () => {
    const port: ProgramItemDiscussionPort = {
      insertMessage: vi.fn(),
      listMessagesForStageItem: vi.fn(),
      listAttentionSummaryForStageItems: vi.fn(),
      listMessagesPage: vi.fn(),
      countMessagesForItem: vi.fn(),
      countLegacyAdminRepliesForStageItem: vi.fn(),
      mergeLegacyAdminReplies: vi.fn(),
      markRead: vi.fn(),
      getUnreadCount: vi.fn().mockResolvedValue(1),
      getLastReadAt: vi.fn().mockResolvedValue("2026-01-01T00:00:00.000Z"),
      getMaxLastReadAtForViewers: vi.fn(),
      countLegacyUnreadAdminReplies: vi.fn().mockResolvedValue(2),
      listLinkedSupportMessageIdsForStageItem: vi.fn().mockResolvedValue(["linked-support-id"]),
      findStageItemIdBySupportMessageId: vi.fn(),
      listStageItemIdsByExerciseTitleForPatient: vi.fn(),
      getMessageById: vi.fn(),
      deleteMessageById: vi.fn(),
      listUnreadExerciseCommentsForDoctor: vi.fn(),
      listExerciseCommentsForDoctor: vi.fn(),
      listUnreadCountsForViewerByStageItems: vi.fn(),
    };
    const service = createProgramItemDiscussionService(port);

    const count = await service.getUnreadCount({
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stageItemId: "33333333-3333-4333-8333-333333333333",
      exerciseTitle: "Подъем руки",
    });

    expect(count).toBe(3);
    expect(port.countLegacyUnreadAdminReplies).toHaveBeenCalledWith({
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      exerciseTitle: "Подъем руки",
      excludeSupportMessageIds: ["linked-support-id"],
      lastReadAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
