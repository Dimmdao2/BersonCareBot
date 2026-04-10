import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockSkip = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminders: {
      skipOccurrence: mockSkip,
    },
  }),
}));

import { POST } from "./route";

const SESSION = { user: { userId: "platform-user-1", role: "client" as const, phone: "+79990001122" } };

async function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(occurrenceId: string, init?: RequestInit & { json?: unknown }) {
  const body = init?.json !== undefined ? JSON.stringify(init.json) : "";
  return new Request(`http://localhost/api/patient/reminders/${occurrenceId}/skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...init,
    body: init?.body ?? body,
  });
}

describe("POST /api/patient/reminders/[id]/skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockSkip.mockResolvedValue({
      ok: true,
      data: { occurrenceId: "occ-2", skippedAt: "2026-04-02T12:00:00.000Z" },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(post("occ-2", { json: {} }), await params("occ-2"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when reason exceeds max length", async () => {
    const res = await POST(post("occ-2", { json: { reason: "x".repeat(501) } }), await params("occ-2"));
    expect(res.status).toBe(400);
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it("returns 503 when journal not configured", async () => {
    mockSkip.mockResolvedValue({ ok: false, error: "not_available" });
    const res = await POST(post("occ-2", { json: { reason: "busy" } }), await params("occ-2"));
    expect(res.status).toBe(503);
  });

  it("skips with optional reason", async () => {
    const res = await POST(post("occ-2", { json: { reason: "устал" } }), await params("occ-2"));
    expect(res.status).toBe(200);
    expect(mockSkip).toHaveBeenCalledWith("platform-user-1", "occ-2", "устал");
  });

  it("accepts empty body as null reason", async () => {
    const res = await POST(post("occ-2", { body: "" }), await params("occ-2"));
    expect(res.status).toBe(200);
    expect(mockSkip).toHaveBeenCalledWith("platform-user-1", "occ-2", null);
  });
});
