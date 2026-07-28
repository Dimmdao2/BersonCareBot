import { beforeEach, describe, expect, it, vi } from "vitest";

const patientSessionGateMock = vi.hoisted(() => vi.fn());
const confirmEmailMock = vi.hoisted(() => vi.fn());
const authChannelEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiSession: patientSessionGateMock,
}));
vi.mock("@/app-layer/di/bindAuthModulePorts", () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));
vi.mock("@/modules/auth/authChannelPolicy", () => ({
  AUTH_CHANNEL_DISABLED_ERROR: "auth_channel_disabled",
  isAuthChannelEnabled: authChannelEnabledMock,
}));
vi.mock("@/modules/auth/emailAuth", () => ({
  confirmLatestEmailChallengeCodeForUser: confirmEmailMock,
}));
vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
}));

import { POST } from "./route";

const PATIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function request(code = "123456") {
  return new Request("http://localhost/api/patient/email-change/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

describe("POST /api/patient/email-change/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patientSessionGateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: PATIENT_ID, role: "client" } },
    });
    authChannelEnabledMock.mockResolvedValue(true);
    confirmEmailMock.mockResolvedValue({ ok: true });
  });

  it("confirms the current patient's pending email challenge", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(confirmEmailMock).toHaveBeenCalledWith(
      PATIENT_ID,
      "123456",
      "patient_email_change",
      { profileBindOrganizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    );
  });

  it("rejects a foreign staff audience before reading the email channel", async () => {
    patientSessionGateMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const response = await POST(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unauthorized",
      message: "Требуется вход",
    });
    expect(authChannelEnabledMock).not.toHaveBeenCalled();
    expect(confirmEmailMock).not.toHaveBeenCalled();
  });
});
