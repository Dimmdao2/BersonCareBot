import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockSnooze = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminders: {
      snoozeOccurrence: mockSnooze,
    },
  }),
}));

import { POST } from "./route";

const SESSION = { user: { userId: "platform-user-1", role: "client" as const, phone: "+79990001122" } };

async function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(occurrenceId: string, body: unknown) {
  return new Request(`http://localhost/api/patient/reminders/${occurrenceId}/snooze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/patient/reminders/[id]/snooze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockSnooze.mockResolvedValue({
      ok: true,
      data: { occurrenceId: "occ-1", snoozedUntil: "2026-04-02T14:00:00.000Z" },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(post("occ-1", { minutes: 30 }), await params("occ-1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for disallowed minutes", async () => {
    const res = await POST(post("occ-1", { minutes: 15 }), await params("occ-1"));
    expect(res.status).toBe(400);
    expect(mockSnooze).not.toHaveBeenCalled();
  });

  it("returns 503 when journal not configured", async () => {
    mockSnooze.mockResolvedValue({ ok: false, error: "not_available" });
    const res = await POST(post("occ-1", { minutes: 60 }), await params("occ-1"));
    expect(res.status).toBe(503);
  });

  it("returns 404 when occurrence not found", async () => {
    mockSnooze.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await POST(post("occ-1", { minutes: 30 }), await params("occ-1"));
    expect(res.status).toBe(404);
  });

  it("snoozes with allowed minutes", async () => {
    const res = await POST(post("occ-1", { minutes: 120 }), await params("occ-1"));
    expect(res.status).toBe(200);
    expect(mockSnooze).toHaveBeenCalledWith("platform-user-1", "occ-1", 120);
  });
});
