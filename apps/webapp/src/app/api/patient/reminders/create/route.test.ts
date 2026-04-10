import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { ReminderRule } from "@/modules/reminders/types";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockCreateObject = vi.hoisted(() => vi.fn());
const mockCreateCustom = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminders: {
      createObjectReminder: mockCreateObject,
      createCustomReminder: mockCreateCustom,
    },
  }),
}));

import { POST } from "./route";

const SESSION = { user: { userId: "platform-user-1", role: "client" as const, phone: "+79990001122" } };

const schedule = {
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1200,
  daysMask: "1111111",
};

const sampleObjectRule = (): ReminderRule => ({
  id: "wp-obj-1",
  integratorUserId: "platform-user-1",
  category: "lfk",
  enabled: true,
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1200,
  daysMask: "1111111",
  fallbackEnabled: true,
  linkedObjectType: "lfk_complex",
  linkedObjectId: "550e8400-e29b-41d4-a716-446655440000",
  customTitle: null,
  customText: null,
  updatedAt: "2026-04-02T12:00:00.000Z",
});

const sampleCustomRule = (): ReminderRule => ({
  ...sampleObjectRule(),
  id: "wp-custom-1",
  linkedObjectType: "custom",
  linkedObjectId: null,
  customTitle: "Вода",
  customText: "Утром",
});

function req(body: unknown) {
  return new Request("http://localhost/api/patient/reminders/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/patient/reminders/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockCreateObject.mockResolvedValue({ ok: true, data: sampleObjectRule() });
    mockCreateCustom.mockResolvedValue({ ok: true, data: sampleCustomRule() });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(req({ linkedObjectType: "lfk_complex", linkedObjectId: "x", schedule }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/reminders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("validation_error");
  });

  it("returns 400 for unknown linkedObjectType", async () => {
    const res = await POST(req({ linkedObjectType: "unknown", linkedObjectId: "x", schedule }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when schedule missing", async () => {
    const res = await POST(req({ linkedObjectType: "lfk_complex", linkedObjectId: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for custom without title", async () => {
    const res = await POST(
      req({
        linkedObjectType: "custom",
        customTitle: "   ",
        schedule,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 for object reminder", async () => {
    const res = await POST(
      req({
        linkedObjectType: "lfk_complex",
        linkedObjectId: "550e8400-e29b-41d4-a716-446655440000",
        schedule,
      }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean; reminder: { id: string } };
    expect(json.ok).toBe(true);
    expect(json.reminder.id).toBe("wp-obj-1");
    expect(mockCreateObject).toHaveBeenCalledWith("platform-user-1", {
      linkedObjectType: "lfk_complex",
      linkedObjectId: "550e8400-e29b-41d4-a716-446655440000",
      schedule,
      enabled: true,
    });
  });

  it("returns 201 for custom reminder", async () => {
    const res = await POST(
      req({
        linkedObjectType: "custom",
        customTitle: "Пить воду",
        customText: "Стакан",
        schedule,
      }),
    );
    expect(res.status).toBe(201);
    expect(mockCreateCustom).toHaveBeenCalled();
  });

  it("returns 404 when service reports not_found", async () => {
    mockCreateObject.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await POST(
      req({
        linkedObjectType: "content_section",
        linkedObjectId: "warmups",
        schedule,
      }),
    );
    expect(res.status).toBe(404);
  });
});
