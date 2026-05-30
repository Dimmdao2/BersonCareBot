import { describe, expect, it, vi } from "vitest";
import { createIntegratorSupportBridge } from "./integratorSupportBridge";
import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";

describe("createIntegratorSupportBridge", () => {
  it("applyAdminReply writes admin message for webapp platform conversation", async () => {
    const ensureWebappConversationForUser = vi.fn().mockResolvedValue({ id: "conv-internal" });
    const appendWebappMessage = vi.fn().mockResolvedValue({ id: "msg-1" });
    const notifyPatientOfDoctorReply = vi.fn().mockResolvedValue(undefined);
    const port = {
      ensureWebappConversationForUser,
      appendWebappMessage,
    } as unknown as SupportCommunicationPort;
    const bridge = createIntegratorSupportBridge({ port, notifyPatientOfDoctorReply });
    const platformUserId = "00000000-0000-4000-8000-000000000001";
    const r = await bridge.applyAdminReply({
      integratorConversationId: `webapp:platform:${platformUserId}`,
      integratorMessageId: "webapp-msg:admin-1",
      text: "Ответ врача",
      createdAt: new Date().toISOString(),
    });
    expect(r).toEqual({ ok: true });
    expect(ensureWebappConversationForUser).toHaveBeenCalledWith(platformUserId);
    expect(appendWebappMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: "admin", text: "Ответ врача" }),
    );
    expect(notifyPatientOfDoctorReply).toHaveBeenCalled();
  });

  it("applyAdminReply prefixes text when programNoteStageItemId is set", async () => {
    const sendProgramNoteReply = vi.fn().mockResolvedValue({ ok: true });
    const port = {} as unknown as SupportCommunicationPort;
    const bridge = createIntegratorSupportBridge({ port, sendProgramNoteReply });
    const stageItemId = "22222222-2222-4222-8222-222222222222";
    const platformUserId = "00000000-0000-4000-8000-000000000001";

    const r = await bridge.applyAdminReply({
      integratorConversationId: `webapp:platform:${platformUserId}`,
      integratorMessageId: "webapp-msg:admin-2",
      text: "Делайте медленнее",
      createdAt: new Date().toISOString(),
      programNoteStageItemId: stageItemId,
    });

    expect(r).toEqual({ ok: true });
    expect(sendProgramNoteReply).toHaveBeenCalledWith(
      expect.objectContaining({
        stageItemId,
        integratorConversationId: `webapp:platform:${platformUserId}`,
        text: "Делайте медленнее",
      }),
    );
  });
});
