import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncDiscussionReadFromSupportInboundMessages } from "./syncDiscussionReadFromSupportInbound";
import type { ProgramItemDiscussionPort } from "./ports";
import { formatPatientExerciseCommentReplyText } from "@/modules/messaging/programNoteReplyContext";

describe("syncDiscussionReadFromSupportInboundMessages", () => {
  const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const stageItemId = "33333333-3333-4333-8333-333333333333";
  const supportMessageId = "90000000-0000-4000-8000-000000000001";

  let port: ProgramItemDiscussionPort;

  beforeEach(() => {
    port = {
      insertMessage: vi.fn(),
      listMessagesForStageItem: vi.fn(),
      listAttentionSummaryForStageItems: vi.fn(),
      listMessagesPage: vi.fn(),
      countMessagesForItem: vi.fn(),
      countLegacyAdminRepliesForStageItem: vi.fn(),
      mergeLegacyAdminReplies: vi.fn(),
      markRead: vi.fn(),
      getUnreadCount: vi.fn(),
      getLastReadAt: vi.fn(),
      getMaxLastReadAtForViewers: vi.fn(),
      countLegacyUnreadAdminReplies: vi.fn(),
      listLinkedSupportMessageIdsForStageItem: vi.fn(),
      findStageItemIdBySupportMessageId: vi.fn(),
      listStageItemIdsByExerciseTitleForPatient: vi.fn(),
      getMessageById: vi.fn(),
      deleteMessageById: vi.fn(),
    };
  });

  it("marks read by support_message_id link", async () => {
    vi.mocked(port.findStageItemIdBySupportMessageId).mockResolvedValue(stageItemId);

    const result = await syncDiscussionReadFromSupportInboundMessages({
      port,
      patientUserId,
      inboundAdminMessages: [{ id: supportMessageId, text: "hello" }],
    });

    expect(result).toEqual({ markedStageItemIds: [stageItemId], skippedAmbiguous: 0 });
    expect(port.markRead).toHaveBeenCalledWith({ patientUserId, stageItemId });
    expect(port.listStageItemIdsByExerciseTitleForPatient).not.toHaveBeenCalled();
  });

  it("marks read by legacy title when exactly one stage item matches", async () => {
    vi.mocked(port.findStageItemIdBySupportMessageId).mockResolvedValue(null);
    vi.mocked(port.listStageItemIdsByExerciseTitleForPatient).mockResolvedValue([stageItemId]);

    const text = formatPatientExerciseCommentReplyText({
      exerciseTitle: "Подъем руки",
      doctorText: "Хорошо",
    });

    const result = await syncDiscussionReadFromSupportInboundMessages({
      port,
      patientUserId,
      inboundAdminMessages: [{ id: supportMessageId, text }],
    });

    expect(result).toEqual({ markedStageItemIds: [stageItemId], skippedAmbiguous: 0 });
    expect(port.listStageItemIdsByExerciseTitleForPatient).toHaveBeenCalledWith(patientUserId, "Подъем руки");
    expect(port.markRead).toHaveBeenCalledWith({ patientUserId, stageItemId });
  });

  it("skips ambiguous legacy title matches", async () => {
    vi.mocked(port.findStageItemIdBySupportMessageId).mockResolvedValue(null);
    vi.mocked(port.listStageItemIdsByExerciseTitleForPatient).mockResolvedValue([
      stageItemId,
      "44444444-4444-4444-8444-444444444444",
    ]);

    const text = formatPatientExerciseCommentReplyText({
      exerciseTitle: "Подъем руки",
      doctorText: "Хорошо",
    });

    const result = await syncDiscussionReadFromSupportInboundMessages({
      port,
      patientUserId,
      inboundAdminMessages: [{ id: supportMessageId, text }],
    });

    expect(result).toEqual({ markedStageItemIds: [], skippedAmbiguous: 1 });
    expect(port.markRead).not.toHaveBeenCalled();
  });
});
