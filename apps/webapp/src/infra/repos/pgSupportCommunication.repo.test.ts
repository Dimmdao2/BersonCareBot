import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(),
}));

import { createPgSupportCommunicationPort } from "./pgSupportCommunication";

const TS = "2025-06-01T10:00:00.000Z";

describe("createPgSupportCommunicationPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  describe("upsertConversationFromProjection", () => {
    it("uses ON CONFLICT and skips canonical lookup when integratorUserId empty", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "conv-1" }] });
      const port = createPgSupportCommunicationPort();
      const result = await port.upsertConversationFromProjection({
        integratorConversationId: "conv-a",
        integratorUserId: null,
        source: "telegram",
        adminScope: "support",
        status: "open",
        openedAt: TS,
        lastMessageAt: TS,
      });
      expect(result.id).toBe("conv-1");
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
      const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("ON CONFLICT (integrator_conversation_id)");
      expect(runWebappPgTextMock.mock.calls[0]?.[1]?.[1]).toBeNull();
    });

    it("resolves platform_user_id via platform_users when integratorUserId set", async () => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [{ id: "pu-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "conv-2" }] });
      const port = createPgSupportCommunicationPort();
      await port.upsertConversationFromProjection({
        integratorConversationId: "conv-b",
        integratorUserId: "42",
        source: "telegram",
        adminScope: "",
        status: "open",
        openedAt: TS,
        lastMessageAt: TS,
      });
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
      const lookupSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(lookupSql).toContain("platform_users");
      expect(lookupSql).toContain("merged_into_id IS NULL");
      expect(runWebappPgTextMock.mock.calls[1]?.[1]?.[1]).toBe("pu-1");
    });
  });

  describe("setConversationStatusFromProjection", () => {
    it("falls back to INSERT when UPDATE rowCount is 0", async () => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const port = createPgSupportCommunicationPort();
      await port.setConversationStatusFromProjection({
        integratorConversationId: "missing-conv",
        status: "closed",
        closedAt: TS,
        closeReason: "resolved",
      });
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
      const fallbackSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
      expect(fallbackSql).toContain("INSERT INTO support_conversations");
      expect(fallbackSql).toContain("ON CONFLICT (integrator_conversation_id)");
    });
  });

  describe("listOpenConversationsForAdmin", () => {
    it("passes normalized source, limit and unreadOnly as bound params", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgSupportCommunicationPort();
      await port.listOpenConversationsForAdmin({ source: "  telegram  ", limit: 200, unreadOnly: true });
      const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("sc.status <> 'closed'");
      expect(sql).toContain("last_personal.personal_msg_at IS NOT NULL");
      expect(sql).toContain("$1::text IS NULL OR sc.source = $1");
      expect(sql).toContain("$3::boolean = false OR");
      expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["telegram", 100, true]);
    });

    it("uses null source when filter omitted", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgSupportCommunicationPort();
      await port.listOpenConversationsForAdmin({ limit: 10 });
      expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([null, 10, false]);
    });
  });

  describe("countUnreadUserMessagesForAdmin", () => {
    it("restricts to open conversations", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ c: "3" }] });
      const port = createPgSupportCommunicationPort();
      const n = await port.countUnreadUserMessagesForAdmin();
      expect(n).toBe(3);
      const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("c.status <> 'closed'");
      expect(sql).toContain("c.closed_at IS NULL");
    });
  });

  describe("conversationExists", () => {
    it("returns false when SELECT 1 has no rows", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgSupportCommunicationPort();
      await expect(
        port.conversationExists("00000000-0000-4000-8000-000000000099"),
      ).resolves.toBe(false);
    });
  });
});
