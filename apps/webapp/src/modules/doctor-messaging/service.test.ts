import { describe, expect, it } from "vitest";
import type { MessageLogEntry, MessageLogListResult } from "./ports";
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
  let lastListAllFilters: import("./ports").MessageLogListFilters | undefined;
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
    async listByUser(userId: string): Promise<MessageLogListResult> {
      const items = log.filter((e) => e.userId === userId);
      return { items, total: items.length, page: 1, pageSize: 20 };
    },
    async listAll(p?: import("./ports").MessageLogListParams): Promise<MessageLogListResult> {
      lastListAllFilters = p?.filters;
      return { items: [...log], total: log.length, page: 1, pageSize: 20 };
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
    const list = await service.listMessageHistory({ userId: "user-1" });
    expect(Array.isArray(list.items)).toBe(true);
  });

  it("listAllMessages returns paged result from port.listAll", async () => {
    const list = await service.listAllMessages({ pageSize: 50 });
    expect(Array.isArray(list.items)).toBe(true);
    expect(typeof list.total).toBe("number");
  });

  it("listAllMessages drops invalid filters.userId before port", async () => {
    await service.listAllMessages({
      filters: { userId: "not-a-uuid", category: "reminder" },
    });
    expect(lastListAllFilters).toEqual({ category: "reminder" });
  });

  it("listAllMessages keeps valid uuid filters.userId", async () => {
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    await service.listAllMessages({ filters: { userId: uid } });
    expect(lastListAllFilters).toEqual({ userId: uid });
  });
});
