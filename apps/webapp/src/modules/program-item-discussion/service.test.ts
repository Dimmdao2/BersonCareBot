import { describe, expect, it, vi } from "vitest";
import { createProgramItemDiscussionService } from "./service";
import type { ProgramItemDiscussionPort } from "./ports";

describe("program item discussion service", () => {
  it("rejects empty payload", async () => {
    const service = createProgramItemDiscussionService({
      insertMessage: vi.fn(),
      listMessagesForStageItem: vi.fn(),
      markRead: vi.fn(),
      getUnreadCount: vi.fn(),
    } as unknown as ProgramItemDiscussionPort);

    await expect(
      service.appendMessage({
        instanceStageItemId: "00000000-0000-4000-8000-000000000001",
        patientUserId: "00000000-0000-4000-8000-000000000002",
        senderRole: "patient",
        origin: "patient_observation",
      }),
    ).rejects.toThrow("message_payload_empty");
  });

  it("guards doctor reply by assignment and item status", async () => {
    const insertMessage = vi.fn().mockResolvedValue({ id: "m1" });
    const service = createProgramItemDiscussionService({
      insertMessage,
      listMessagesForStageItem: vi.fn(),
      markRead: vi.fn(),
      getUnreadCount: vi.fn(),
    } as unknown as ProgramItemDiscussionPort);

    await expect(
      service.appendDoctorReplyForProgramNote({
        instanceStageItemId: "00000000-0000-4000-8000-000000000001",
        patientUserId: "00000000-0000-4000-8000-000000000002",
        assignmentSource: "promo",
        itemStatus: "active",
        body: "ok",
        supportMessageId: "00000000-0000-4000-8000-000000000003",
      }),
    ).rejects.toThrow("program_not_doctor_assigned");

    await expect(
      service.appendDoctorReplyForProgramNote({
        instanceStageItemId: "00000000-0000-4000-8000-000000000001",
        patientUserId: "00000000-0000-4000-8000-000000000002",
        assignmentSource: "doctor",
        itemStatus: "disabled",
        body: "ok",
        supportMessageId: "00000000-0000-4000-8000-000000000003",
      }),
    ).rejects.toThrow("program_item_not_active");

    expect(insertMessage).not.toHaveBeenCalled();
  });
});
