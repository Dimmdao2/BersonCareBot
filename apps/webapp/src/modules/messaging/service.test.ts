import { describe, expect, it, vi } from "vitest";
import { createPatientMessagingService } from "./patientMessagingService";
import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";

describe("createPatientMessagingService", () => {
  it("sendText returns validation error for empty text", async () => {
    const port = {
      getConversationIfOwnedByUser: vi.fn().mockResolvedValue({ id: "c1" }),
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

  it("bootstrap calls ensure and listMessagesSince", async () => {
    const ensure = vi.fn().mockResolvedValue({ id: "conv-1" });
    const list = vi.fn().mockResolvedValue([]);
    const port = {
      ensureWebappConversationForUser: ensure,
      listMessagesSince: list,
    } as unknown as SupportCommunicationPort;
    const svc = createPatientMessagingService(port);
    const r = await svc.bootstrap("user-1");
    expect(ensure).toHaveBeenCalledWith("user-1");
    expect(list).toHaveBeenCalled();
    expect(r.conversationId).toBe("conv-1");
  });
});
