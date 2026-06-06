import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import { createPgBroadcastAuditPort } from "./pgBroadcastAudit";

describe("pgBroadcastAudit (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("append inserts and maps RETURNING row", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "1",
          actor_id: "a1",
          category: "service",
          audience_filter: "all",
          message_title: "t",
          message_body: "b",
          channels: ["sms"],
          executed_at: "2026-01-01T00:00:00.000Z",
          preview_only: false,
          audience_size: 10,
          delivery_jobs_total: 10,
          attach_menu_after_send: false,
          sent_count: 8,
          error_count: 2,
        },
      ],
    });
    const port = createPgBroadcastAuditPort();
    const entry = await port.append({
      actorId: "a1",
      category: "service",
      audienceFilter: "all",
      messageTitle: "t",
      messageBody: "b",
      channels: ["sms"],
      previewOnly: false,
      audienceSize: 10,
      deliveryJobsTotal: 10,
      attachMenuAfterSend: false,
      sentCount: 8,
      errorCount: 2,
      blockedRecipientCount: 0,
    });
    expect(entry.id).toBe("1");
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("INSERT INTO broadcast_audit");
  });

  it("list orders by executed_at DESC with limit", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgBroadcastAuditPort();
    await port.list(25);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("ORDER BY executed_at DESC LIMIT $1");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([25]);
  });
});
