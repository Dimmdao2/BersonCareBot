import { describe, expect, it, vi } from "vitest";
import { createPatientMessagingService } from "./patientMessagingService";
import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";

describe("createPatientMessagingService", () => {
  it("sendText returns validation error for empty text", async () => {
    const port = {
      // status/closedAt required since 890f182b1 (fix(patient): reject inactive support sends
      // safely) — sendText now gates on conversation being open before validating the text.
      getConversationIfOwnedByUser: vi.fn().mockResolvedValue({ id: "c1", status: "open", closedAt: null }),
      appendWebappMessage: vi.fn(),
    } as unknown as SupportCommunicationPort;
    const svc = createPatientMessagingService(port);
    const r = await svc.sendText("u1", "00000000-0000-4000-8000-000000000001", "   ");
    expect(r).toEqual({ ok: false, error: "empty" });
    expect(port.appendWebappMessage).not.toHaveBeenCalled();
  });

  it("sendText returns not_found when conversation not owned", async () => {
    const port = {
      getConversationIfOwnedByUser: vi.fn().mockResolvedValue(null),
      appendWebappMessage: vi.fn(),
    } as unknown as SupportCommunicationPort;
    const svc = createPatientMessagingService(port);
    const r = await svc.sendText("u1", "00000000-0000-4000-8000-000000000001", "hi");
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("sendText notifies doctor when configured", async () => {
    const notifyDoctorOfPatientMessage = vi.fn().mockResolvedValue(undefined);
    const port = {
      getConversationIfOwnedByUser: vi.fn().mockResolvedValue({
        id: "c1",
        organizationId: "11111111-1111-4111-8111-111111111111",
        status: "open",
        closedAt: null,
      }),
      ensureWebappConversationForUser: vi.fn().mockResolvedValue({
        id: "c1",
        organizationId: "11111111-1111-4111-8111-111111111111",
      }),
      mergeLegacySupportConversationsForPlatformUser: vi.fn().mockResolvedValue({
        mergedConversationCount: 0,
        movedMessageCount: 0,
      }),
      appendWebappMessage: vi.fn().mockResolvedValue({ id: "m1", created: true }),
    } as unknown as SupportCommunicationPort;
    const svc = createPatientMessagingService(port, {
      notifyDoctorOfPatientMessage,
      resolvePatientLabel: async () => "Иван",
    });
    const r = await svc.sendText("u1", "00000000-0000-4000-8000-000000000001", "Привет");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.message).toMatchObject({
        id: "m1",
        text: "Привет",
        senderRole: "user",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notifyDoctorOfPatientMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "11111111-1111-4111-8111-111111111111",
        messageText: "Привет",
        patientLabel: "Иван",
      }),
    );
  });

  it("bootstrap calls ensure and listMessagesSince", async () => {
    const ensure = vi.fn().mockResolvedValue({ id: "conv-1" });
    const list = vi.fn().mockResolvedValue([]);
    const port = {
      ensureWebappConversationForUser: ensure,
      mergeLegacySupportConversationsForPlatformUser: vi.fn().mockResolvedValue({
        mergedConversationCount: 0,
        movedMessageCount: 0,
      }),
      listMessagesSince: list,
    } as unknown as SupportCommunicationPort;
    const svc = createPatientMessagingService(port);
    const r = await svc.bootstrap("user-1");
    expect(ensure).toHaveBeenCalledWith("user-1");
    expect(list).toHaveBeenCalled();
    expect(r.conversationId).toBe("conv-1");
  });
});
