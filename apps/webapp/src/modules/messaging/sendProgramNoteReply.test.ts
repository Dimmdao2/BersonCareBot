import { describe, expect, it, vi } from "vitest";
import { createSendProgramNoteReply } from "./sendProgramNoteReply";
import type { ProgramItemDiscussionService } from "@/modules/program-item-discussion/service";
import type { PatientInboundChatPort } from "@/modules/messaging/ports";

vi.mock("@/modules/messaging/programNoteReplyContext", () => ({
  resolveProgramNoteReplyContext: vi.fn(),
  formatPatientExerciseCommentReplyText: vi.fn(({ exerciseTitle, doctorText }: { exerciseTitle: string; doctorText: string }) =>
    `Ответ на ваш комментарий к упражнению «${exerciseTitle}»:\n\n${doctorText}`,
  ),
}));

import { resolveProgramNoteReplyContext } from "@/modules/messaging/programNoteReplyContext";

describe("createSendProgramNoteReply", () => {
  it("writes support message and discussion row", async () => {
    const platformUserId = "00000000-0000-4000-8000-000000000001";
    const stageItemId = "00000000-0000-4000-8000-000000000002";
    vi.mocked(resolveProgramNoteReplyContext).mockResolvedValue({
      platformUserId,
      stageItemId,
      exerciseTitle: "Присед",
      integratorConversationId: `webapp:platform:${platformUserId}`,
      programNoteReplyState: `admin_reply:webapp:platform:${platformUserId}#pn:${stageItemId}`,
      assignmentSource: "doctor",
      itemStatus: "active",
    });
    const ensureWebappConversationForUser = vi.fn().mockResolvedValue({ id: "conv-1" });
    const appendWebappMessage = vi.fn().mockResolvedValue({ id: "support-msg-1" });
    const notifyPatientOfDoctorReply = vi.fn().mockResolvedValue(undefined);
    const appendDoctorReplyForProgramNote = vi.fn().mockResolvedValue({ id: "discussion-1" });

    const sendProgramNoteReply = createSendProgramNoteReply({
      supportCommunication: {
        ensureWebappConversationForUser,
        appendWebappMessage,
      } as unknown as PatientInboundChatPort,
      discussion: {
        appendDoctorReplyForProgramNote,
      } as unknown as ProgramItemDiscussionService,
      notifyPatientOfDoctorReply,
    });

    const result = await sendProgramNoteReply({
      integratorConversationId: `webapp:platform:${platformUserId}`,
      integratorMessageId: "webapp-msg:1",
      stageItemId,
      text: "Делайте медленнее",
      createdAt: "2026-05-30T03:00:00.000Z",
      source: "webapp",
    });

    expect(result).toEqual({
      ok: true,
      platformUserId,
      chatText: "Ответ на ваш комментарий к упражнению «Присед»:\n\nДелайте медленнее",
      supportMessageId: "support-msg-1",
    });
    expect(appendWebappMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderRole: "admin",
        text: "Ответ на ваш комментарий к упражнению «Присед»:\n\nДелайте медленнее",
      }),
    );
    expect(appendDoctorReplyForProgramNote).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceStageItemId: stageItemId,
        patientUserId: platformUserId,
        supportMessageId: "support-msg-1",
      }),
    );
    expect(notifyPatientOfDoctorReply).toHaveBeenCalledTimes(1);
  });

  it("returns mismatch when stage item belongs another patient", async () => {
    const stageItemId = "00000000-0000-4000-8000-000000000002";
    vi.mocked(resolveProgramNoteReplyContext).mockResolvedValue({
      platformUserId: "00000000-0000-4000-8000-000000000009",
      stageItemId,
      exerciseTitle: "Присед",
      integratorConversationId: "webapp:platform:00000000-0000-4000-8000-000000000009",
      programNoteReplyState: "state",
      assignmentSource: "doctor",
      itemStatus: "active",
    });

    const sendProgramNoteReply = createSendProgramNoteReply({
      supportCommunication: {} as PatientInboundChatPort,
      discussion: {} as ProgramItemDiscussionService,
    });

    const result = await sendProgramNoteReply({
      integratorConversationId: "webapp:platform:00000000-0000-4000-8000-000000000001",
      integratorMessageId: "webapp-msg:2",
      stageItemId,
      text: "Ок",
    });

    expect(result).toEqual({ ok: false, error: "stage_item_mismatch" });
  });
});
