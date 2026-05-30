import { describe, expect, it, vi } from "vitest";
import {
  appendPatientInboundAdminMessage,
  broadcastChatIntegratorMessageId,
  bookingLifecycleChatIntegratorMessageId,
} from "./appendPatientInboundAdminMessage";
import type { PatientInboundChatPort } from "@/modules/messaging/ports";

function createPort(overrides: Partial<PatientInboundChatPort> = {}): PatientInboundChatPort {
  return {
    ensureWebappConversationForUser: vi.fn().mockResolvedValue({ id: "conv-1" }),
    mergeLegacySupportConversationsForPlatformUser: vi.fn().mockResolvedValue({
      mergedConversationCount: 0,
      movedMessageCount: 0,
    }),
    appendWebappMessage: vi.fn().mockResolvedValue({ id: "msg-1", created: true }),
    ...overrides,
  } as unknown as PatientInboundChatPort;
}

describe("appendPatientInboundAdminMessage", () => {
  it("returns null for empty text", async () => {
    const port = createPort();
    const r = await appendPatientInboundAdminMessage(port, {
      platformUserId: "u1",
      text: "   ",
      integratorMessageId: "x",
    });
    expect(r).toBeNull();
    expect(port.appendWebappMessage).not.toHaveBeenCalled();
  });

  it("merges legacy, ensures conversation, appends admin message", async () => {
    const port = createPort();
    const r = await appendPatientInboundAdminMessage(port, {
      platformUserId: "u1",
      text: "Заголовок\n\nТекст",
      integratorMessageId: "broadcast:a1:u1",
    });
    expect(r).toEqual({ conversationId: "conv-1", messageId: "msg-1" });
    expect(port.mergeLegacySupportConversationsForPlatformUser).toHaveBeenCalledWith("u1");
    expect(port.ensureWebappConversationForUser).toHaveBeenCalledWith("u1");
    expect(port.appendWebappMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        integratorMessageId: "broadcast:a1:u1",
        senderRole: "admin",
        text: "Заголовок\n\nТекст",
        source: "webapp",
      }),
    );
  });

  it("truncates text over 4000 chars", async () => {
    const port = createPort();
    const long = "a".repeat(5000);
    await appendPatientInboundAdminMessage(port, {
      platformUserId: "u1",
      text: long,
      integratorMessageId: "x",
    });
    const call = vi.mocked(port.appendWebappMessage).mock.calls[0]![0];
    expect(call.text.length).toBe(4000);
    expect(call.text.endsWith("…")).toBe(true);
  });
});

describe("integrator message id helpers", () => {
  it("broadcastChatIntegratorMessageId", () => {
    expect(broadcastChatIntegratorMessageId("audit-1", "user-1")).toBe("broadcast:audit-1:user-1");
  });

  it("bookingLifecycleChatIntegratorMessageId", () => {
    expect(bookingLifecycleChatIntegratorMessageId("created", "b1")).toBe("booking-created:b1");
  });
});
