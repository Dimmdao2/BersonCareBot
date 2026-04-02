import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderRule } from "@/modules/reminders/types";

const mockRequirePatientAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientAccess: mockRequirePatientAccess,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUpdateRule = vi.hoisted(() => vi.fn());
const mockDeleteReminder = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminders: {
      updateRule: mockUpdateRule,
      deleteReminder: mockDeleteReminder,
    },
  }),
}));

import { DELETE, PATCH } from "./route";

const SESSION = { user: { userId: "platform-user-1" } };

const sampleRule = (): ReminderRule => ({
  id: "wp-1",
  integratorUserId: "platform-user-1",
  category: "lfk",
  enabled: true,
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1200,
  daysMask: "1111111",
  fallbackEnabled: true,
  linkedObjectType: null,
  linkedObjectId: null,
  customTitle: null,
  customText: null,
  updatedAt: "2026-04-02T12:00:00.000Z",
});

async function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/patient/reminders/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientAccess.mockResolvedValue(SESSION);
    mockUpdateRule.mockResolvedValue({ ok: true, data: sampleRule() });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientAccess.mockRejectedValue(new Error("no session"));
    const res = await PATCH(
      new Request("http://localhost/api/patient/reminders/wp-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      await params("wp-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty patch body", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/patient/reminders/wp-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      await params("wp-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when rule belongs to another user", async () => {
    mockUpdateRule.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await PATCH(
      new Request("http://localhost/api/patient/reminders/wp-x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      await params("wp-x"),
    );
    expect(res.status).toBe(404);
  });

  it("updates rule when owned", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/patient/reminders/wp-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      await params("wp-1"),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateRule).toHaveBeenCalledWith("platform-user-1", "wp-1", { enabled: false });
  });
});

describe("DELETE /api/patient/reminders/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientAccess.mockResolvedValue(SESSION);
    mockDeleteReminder.mockResolvedValue({ ok: true, data: { deletedId: "wp-1" } });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientAccess.mockRejectedValue(new Error("no session"));
    const res = await DELETE(new Request("http://localhost/api/patient/reminders/wp-1"), await params("wp-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for ownership / missing rule", async () => {
    mockDeleteReminder.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await DELETE(new Request("http://localhost/api/patient/reminders/wp-other"), await params("wp-other"));
    expect(res.status).toBe(404);
  });

  it("deletes owned rule", async () => {
    const res = await DELETE(new Request("http://localhost/api/patient/reminders/wp-1"), await params("wp-1"));
    expect(res.status).toBe(200);
    expect(mockDeleteReminder).toHaveBeenCalledWith("platform-user-1", "wp-1");
  });
});
