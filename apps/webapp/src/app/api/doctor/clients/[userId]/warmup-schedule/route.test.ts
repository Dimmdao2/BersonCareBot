import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { ReminderRule } from "@/modules/reminders/types";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));
const getClientIdentityForOrganizationMock = vi.hoisted(() => vi.fn());
const listRulesByUserMock = vi.hoisted(() => vi.fn());
const updateRuleMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorClientsPort: {
      getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
    },
    reminders: {
      listRulesByUser: listRulesByUserMock,
      updateRule: updateRuleMock,
    },
  }),
}));

import { GET, PATCH } from "./route";

const patientId = "123e4567-e89b-42d3-a456-426614174000";
const organizationId = "223e4567-e89b-42d3-a456-426614174000";

const warmupRule: ReminderRule = {
  id: "rule-1",
  integratorUserId: null,
  category: "important",
  enabled: true,
  intervalMinutes: null,
  windowStartMinute: 8 * 60,
  windowEndMinute: 20 * 60,
  daysMask: "1111111",
  timezone: "Europe/Moscow",
  fallbackEnabled: true,
  linkedObjectType: "content_section",
  linkedObjectId: "warmups",
  customTitle: null,
  customText: null,
  scheduleType: "slots_v1",
  scheduleData: {
    timesLocal: ["09:00"],
    dayFilter: "weekdays",
  },
  reminderIntent: "warmup",
  displayTitle: null,
  displayDescription: null,
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
  notificationTopicCode: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function patch(body: unknown) {
  return new Request(`http://localhost/api/doctor/clients/${patientId}/warmup-schedule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("doctor client warmup-schedule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: "doc-1", role: "doctor" } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: patientId });
    listRulesByUserMock.mockResolvedValue([warmupRule]);
    updateRuleMock.mockResolvedValue({ ok: true, data: warmupRule });
  });

  it("GET returns workspace gate response when doctor workspace is unavailable", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "doctor_workspace_membership_required" }, { status: 403 }),
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientId }),
    });

    expect(res.status).toBe(403);
    expect(listRulesByUserMock).not.toHaveBeenCalled();
  });

  it("GET resolves patient inside selected organization", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: patientId }),
    });

    const body = (await res.json()) as { ok: boolean; rule: { id: string } | null };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rule?.id).toBe("rule-1");
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(patientId, organizationId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
  });

  it("PATCH updates warmup rule under workspace principal", async () => {
    const res = await PATCH(patch({ timesLocal: ["10:30"], dayFilter: "weekdays" }), {
      params: Promise.resolve({ userId: patientId }),
    });

    expect(res.status).toBe(200);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(patientId, organizationId);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
    expect(updateRuleMock).toHaveBeenCalledWith(
      patientId,
      "rule-1",
      expect.objectContaining({
        schedule: expect.objectContaining({
          scheduleType: "slots_v1",
          scheduleData: expect.objectContaining({ timesLocal: ["10:30"] }),
        }),
      }),
    );
  });

  it("PATCH returns 404 when patient is outside selected organization", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);

    const res = await PATCH(patch({ timesLocal: ["10:30"] }), {
      params: Promise.resolve({ userId: patientId }),
    });

    expect(res.status).toBe(404);
    expect(updateRuleMock).not.toHaveBeenCalled();
  });
});
