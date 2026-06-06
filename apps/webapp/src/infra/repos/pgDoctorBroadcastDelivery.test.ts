import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: clientQueryMock,
    release: vi.fn(),
  })),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ connect: connectMock })));

vi.mock("@/infra/db/runWebappSql", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/db/runWebappSql")>();
  return {
    ...actual,
    runWebappPgText: runWebappPgTextMock,
  };
});

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgDoctorBroadcastDeliveryCommitPort } from "./pgDoctorBroadcastDelivery";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";

const auditBase: Omit<BroadcastAuditEntry, "id" | "executedAt"> = {
  actorId: "doc-1",
  category: "service" as const,
  audienceFilter: "all" as const,
  messageTitle: "Hi",
  messageBody: "Body",
  channels: ["bot_message"],
  previewOnly: false,
  audienceSize: 1,
  deliveryJobsTotal: 1,
  attachMenuAfterSend: false,
  sentCount: 0,
  errorCount: 0,
};

describe("pgDoctorBroadcastDelivery commitAuditAndDeliveryQueue", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockClear();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it("commits audit, queue jobs, and recipients via runWebappPgText on tx client", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "audit-1",
            actor_id: "doc-1",
            category: "service",
            audience_filter: "all",
            message_title: "Hi",
            message_body: "Body",
            channels: ["bot_message"],
            executed_at: "2026-01-01T00:00:00.000Z",
            preview_only: false,
            audience_size: 1,
            delivery_jobs_total: 1,
            attach_menu_after_send: false,
            sent_count: 0,
            error_count: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "job-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const port = createPgDoctorBroadcastDeliveryCommitPort();
    const entry = await port.commitAuditAndDeliveryQueue({
      auditId: "audit-1",
      audit: auditBase,
      jobs: [
        {
          eventId: "evt-1",
          kind: "doctor_broadcast",
          channel: "telegram",
          payloadJson: { text: "x" },
          maxAttempts: 3,
        },
      ],
      recipientUserIds: ["user-1"],
    });

    expect(entry.id).toBe("audit-1");
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("INSERT INTO broadcast_audit");
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain("outgoing_delivery_queue");
    expect(String(runWebappPgTextMock.mock.calls[2]?.[0])).toContain("broadcast_audit_recipients");
  });

  it("rolls back when queue insert is skipped by conflict", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ id: "audit-1", actor_id: "doc-1", category: "service", audience_filter: "all", message_title: "Hi", message_body: "", channels: [], executed_at: "2026-01-01T00:00:00.000Z", preview_only: false, audience_size: 0, delivery_jobs_total: 0, attach_menu_after_send: false, sent_count: 0, error_count: 0 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const port = createPgDoctorBroadcastDeliveryCommitPort();
    await expect(
      port.commitAuditAndDeliveryQueue({
        auditId: "audit-1",
        audit: auditBase,
        jobs: [
          {
            eventId: "evt-dup",
            kind: "doctor_broadcast",
            channel: "telegram",
            payloadJson: {},
            maxAttempts: 3,
          },
        ],
        recipientUserIds: [],
      }),
    ).rejects.toThrow("outgoing_delivery_queue_insert_conflict_or_skipped");

    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });
});
