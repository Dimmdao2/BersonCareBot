import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminModeSessionMock,
  buildAppDepsMock,
  clearDeadForProbeMock,
  writeAuditLogMock,
  getPoolMock,
} = vi.hoisted(() => {
  const requireAdminModeSessionMock = vi.fn();
  const clearDeadForProbeMock = vi.fn();
  const writeAuditLogMock = vi.fn();
  const getPoolMock = vi.fn(() => ({ tag: "pool" }));
  const buildAppDepsMock = vi.fn(() => ({
    healthFailureArchive: {
      clearDeadForProbe: clearDeadForProbeMock,
    },
  }));
  return {
    requireAdminModeSessionMock,
    buildAppDepsMock,
    clearDeadForProbeMock,
    writeAuditLogMock,
    getPoolMock,
  };
});

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/app-layer/admin/auditLog", () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLogMock(...a),
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: getPoolMock,
}));

import {
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
  HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
} from "@/modules/operator-health/healthFailureArchiveConstants";
import type { HealthFailureArchivePort } from "@/modules/operator-health/healthFailureArchivePort";
import { createHealthFailureArchiveService } from "@/modules/operator-health/healthFailureArchiveService";
import { POST } from "./route";

function makeArchivePort(overrides: Partial<HealthFailureArchivePort> = {}): HealthFailureArchivePort {
  return {
    archiveOutgoingDeadBatch: vi.fn().mockResolvedValue({ inserted: 0, deleted: 0 }),
    archiveIntegratorPushOutboxDeadBatch: vi.fn().mockResolvedValue({ inserted: 0, deleted: 0 }),
    archiveProjectionDeadBatch: vi.fn().mockResolvedValue({ inserted: 0, deleted: 0 }),
    archiveOutgoingReminderDeadBatch: vi.fn().mockResolvedValue({ inserted: 0, deleted: 0 }),
    listForAdmin: vi.fn(),
    listForDoctor: vi.fn(),
    deleteArchivedBefore: vi.fn(),
    ...overrides,
  };
}

describe("POST /api/admin/health-failure-archive/clear", () => {
  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    clearDeadForProbeMock.mockReset();
    buildAppDepsMock.mockClear();
    writeAuditLogMock.mockReset();
    getPoolMock.mockClear();
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("returns 403 when gate fails", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 403 }),
    });
    const res = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "outgoing_delivery" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(clearDeadForProbeMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    const res = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "nope" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns inserted/deleted, writes admin_audit_log, idempotent second call", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    clearDeadForProbeMock.mockResolvedValueOnce({ inserted: 2, deleted: 2 });
    const res1 = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "outgoing_delivery" }),
      }),
    );
    expect(res1.status).toBe(200);
    const b1 = (await res1.json()) as { ok: boolean; inserted: number; deleted: number };
    expect(b1.ok).toBe(true);
    expect(b1.inserted).toBe(2);
    expect(b1.deleted).toBe(2);

    clearDeadForProbeMock.mockResolvedValueOnce({ inserted: 0, deleted: 0 });
    const res2 = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "outgoing_delivery" }),
      }),
    );
    expect(res2.status).toBe(200);
    const b2 = (await res2.json()) as { ok: boolean; inserted: number; deleted: number };
    expect(b2.inserted).toBe(0);
    expect(b2.deleted).toBe(0);

    expect(writeAuditLogMock).toHaveBeenCalledTimes(2);
    expect(getPoolMock).toHaveBeenCalledTimes(2);
    expect(writeAuditLogMock).toHaveBeenNthCalledWith(
      1,
      { tag: "pool" },
      expect.objectContaining({
        actorId: "a1",
        action: "health_failure_archive_clear_dead",
        details: { probe: "outgoing_delivery", inserted: 2, deleted: 2 },
        status: "ok",
      }),
    );
    expect(writeAuditLogMock).toHaveBeenNthCalledWith(
      2,
      { tag: "pool" },
      expect.objectContaining({
        details: { probe: "outgoing_delivery", inserted: 0, deleted: 0 },
      }),
    );
  });

  it("accepts projection_outbox probe", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    clearDeadForProbeMock.mockResolvedValueOnce({ inserted: 1, deleted: 1 });
    const res = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "projection_outbox" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(clearDeadForProbeMock).toHaveBeenCalledWith(
      expect.objectContaining({ probe: "projection_outbox", archivedByUserId: "a1" }),
    );
  });

  it("accepts outgoing_reminder_dispatch probe", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    clearDeadForProbeMock.mockResolvedValueOnce({ inserted: 0, deleted: 0 });
    const res = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "outgoing_reminder_dispatch" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(clearDeadForProbeMock).toHaveBeenCalledWith(
      expect.objectContaining({ probe: "outgoing_reminder_dispatch" }),
    );
  });

  it("accepts integrator_push_outbox probe", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" } },
    });
    clearDeadForProbeMock.mockResolvedValueOnce({ inserted: 1, deleted: 1 });
    const res = await POST(
      new Request("http://localhost/api/admin/health-failure-archive/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: "integrator_push_outbox" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(clearDeadForProbeMock).toHaveBeenCalledWith(
      expect.objectContaining({ probe: "integrator_push_outbox", archivedByUserId: "a1" }),
    );
  });
});

describe("createHealthFailureArchiveService.clearDeadForProbe", () => {
  it("loops outgoing_delivery batches until deleted=0", async () => {
    const port = makeArchivePort({
      archiveOutgoingDeadBatch: vi
        .fn()
        .mockResolvedValueOnce({ inserted: 2, deleted: 2 })
        .mockResolvedValueOnce({ inserted: 0, deleted: 0 }),
    });
    const svc = createHealthFailureArchiveService(port);
    const r = await svc.clearDeadForProbe({
      probe: HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
      archivedByUserId: "u1",
    });
    expect(r).toEqual({ inserted: 2, deleted: 2 });
    expect(port.archiveOutgoingDeadBatch).toHaveBeenCalledTimes(2);
  });

  it("uses integrator outbox batch for integrator_push_outbox probe", async () => {
    const port = makeArchivePort({
      archiveIntegratorPushOutboxDeadBatch: vi.fn().mockResolvedValue({ inserted: 1, deleted: 0 }),
    });
    const svc = createHealthFailureArchiveService(port);
    const r = await svc.clearDeadForProbe({
      probe: HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
      archivedByUserId: "u1",
    });
    expect(r).toEqual({ inserted: 1, deleted: 0 });
    expect(port.archiveIntegratorPushOutboxDeadBatch).toHaveBeenCalledTimes(1);
    expect(port.archiveProjectionDeadBatch).not.toHaveBeenCalled();
  });

  it("uses projection batch for projection_outbox probe", async () => {
    const port = makeArchivePort({
      archiveProjectionDeadBatch: vi
        .fn()
        .mockResolvedValueOnce({ inserted: 3, deleted: 3 })
        .mockResolvedValueOnce({ inserted: 0, deleted: 0 }),
    });
    const svc = createHealthFailureArchiveService(port);
    const r = await svc.clearDeadForProbe({
      probe: HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
      archivedByUserId: "u1",
    });
    expect(r).toEqual({ inserted: 3, deleted: 3 });
    expect(port.archiveProjectionDeadBatch).toHaveBeenCalledTimes(2);
  });

  it("uses reminder batch for outgoing_reminder_dispatch probe", async () => {
    const port = makeArchivePort({
      archiveOutgoingReminderDeadBatch: vi.fn().mockResolvedValue({ inserted: 1, deleted: 0 }),
    });
    const svc = createHealthFailureArchiveService(port);
    const r = await svc.clearDeadForProbe({
      probe: HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
      archivedByUserId: "u1",
    });
    expect(r).toEqual({ inserted: 1, deleted: 0 });
    expect(port.archiveOutgoingReminderDeadBatch).toHaveBeenCalledTimes(1);
    expect(port.archiveOutgoingDeadBatch).not.toHaveBeenCalled();
  });
});
