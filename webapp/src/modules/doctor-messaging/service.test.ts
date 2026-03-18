import { describe, expect, it } from "vitest";
import type { MessageLogEntry } from "./ports";
import { createDoctorMessagingService } from "./service";

describe("doctor-messaging service", () => {
  const getClientIdentity = async (userId: string) =>
    userId === "user-1"
      ? {
          userId: "user-1",
          displayName: "Иван",
          bindings: { telegramId: "tg1", maxId: undefined, vkId: undefined },
        }
      : null;

  const getDeliveryTargets = async (params: { telegramId?: string; maxId?: string }) => {
    if (params.telegramId === "tg1") return { channelBindings: { telegramId: "tg1" } };
    return null;
  };

  const log: MessageLogEntry[] = [];
  const messageLogPort = {
    async append(entry: Omit<MessageLogEntry, "id" | "sentAt">): Promise<MessageLogEntry> {
      const e: MessageLogEntry = {
        ...entry,
        id: "msg-1",
        sentAt: new Date().toISOString(),
      };
      log.push(e);
      return e;
    },
    async listByUser(userId: string): Promise<MessageLogEntry[]> {
      return log.filter((e) => e.userId === userId);
    },
  };

  const service = createDoctorMessagingService({
    getClientIdentity,
    getDeliveryTargets,
    messageLogPort,
  });

  it("prepareMessageDraft returns null for unknown userId", async () => {
    const draft = await service.prepareMessageDraft({ userId: "unknown" });
    expect(draft).toBeNull();
  });

  it("prepareMessageDraft returns channels for known client", async () => {
    const draft = await service.prepareMessageDraft({ userId: "user-1" });
    expect(draft).not.toBeNull();
    expect(draft!.clientLabel).toBe("Иван");
    expect(draft!.availableChannels).toContain("telegram");
  });

  it("sendMessage with empty channelBindings logs failed", async () => {
    const result = await service.sendMessage({
      userId: "user-1",
      senderId: "doc-1",
      text: "Test",
      category: "reminder",
      channelBindings: {},
    });
    expect(result.success).toBe(false);
    expect(result.entry.id).toBeDefined();
  });

  it("sendMessage with channelBindings logs sent", async () => {
    const result = await service.sendMessage({
      userId: "user-1",
      senderId: "doc-1",
      text: "Hello",
      category: "reminder",
      channelBindings: { telegramId: "tg1" },
    });
    expect(result.success).toBe(true);
  });

  it("listMessageHistory returns entries for user", async () => {
    const list = await service.listMessageHistory("user-1");
    expect(Array.isArray(list)).toBe(true);
  });
});
