/**
 * Tests for admin email-change initiation endpoints and patient confirmation endpoint.
 *
 * Coverage:
 *  - Doctor (non-admin) is blocked with 403 on both POST and GET admin routes
 *  - Admin can initiate email change (challenge created, code sent via mocked emailSendPort)
 *  - Admin GET returns pending email when a challenge exists
 *  - Admin GET returns null when no challenge
 *  - Patient confirm with correct code switches email (ok: true)
 *  - Patient confirm with incorrect code returns invalid_code (400)
 *  - Patient confirm with no pending challenge returns expired_code (400)
 *  - Unauthenticated patient gets 401
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Hoist mocks so vi.mock() factory runs before imports
// ---------------------------------------------------------------------------

const {
  getCurrentSessionMock,
  requireDoctorWorkspaceApiContextMock,
  requirePatientApiSessionMock,
  withDoctorWorkspacePrincipalMock,
  buildAppDepsMock,
  getClientIdentityForOrganizationMock,
  startEmailChallengeMock,
  normalizeEmailMock,
  getPendingEmailChallengeMock,
  confirmLatestEmailChallengeCodeForUserMock,
  ensureAuthModulePortsBoundMock,
  getCurrentDbPrincipalOrganizationIdMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  requireDoctorWorkspaceApiContextMock: vi.fn(),
  requirePatientApiSessionMock: vi.fn(),
  withDoctorWorkspacePrincipalMock: vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}),
  getClientIdentityForOrganizationMock: vi.fn(),
  buildAppDepsMock: vi.fn(),
  startEmailChallengeMock: vi.fn(),
  normalizeEmailMock: vi.fn((email: string) => email.trim().toLowerCase()),
  getPendingEmailChallengeMock: vi.fn(),
  confirmLatestEmailChallengeCodeForUserMock: vi.fn(),
  ensureAuthModulePortsBoundMock: vi.fn(),
  getCurrentDbPrincipalOrganizationIdMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
  // patient/email-change/confirm moved off raw session access onto an approved guard (route guard
  // census remediation, 2026-07-28); the double must expose it or the route fails on the mock.
  requirePatientApiSession: () => requirePatientApiSessionMock(),
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
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/modules/auth/emailAuth", () => ({
  startEmailChallenge: (...args: unknown[]) => startEmailChallengeMock(...args),
  normalizeEmail: (...args: unknown[]) => normalizeEmailMock(...args as [string]),
  getPendingEmailChallenge: (...args: unknown[]) => getPendingEmailChallengeMock(...args),
  confirmLatestEmailChallengeCodeForUser: (...args: unknown[]) =>
    confirmLatestEmailChallengeCodeForUserMock(...args),
}));

vi.mock("@/app-layer/di/bindAuthModulePorts", () => ({
  ensureAuthModulePortsBound: () => ensureAuthModulePortsBoundMock(),
}));

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentObservabilityContext: vi.fn(() => ({})),
  getCurrentDbPrincipalOrganizationId: () => getCurrentDbPrincipalOrganizationIdMock(),
}));

import { POST as adminPost, GET as adminGet } from "./route";
import { POST as patientConfirmPost } from "@/app/api/patient/email-change/confirm/route";
import * as authChannelPolicy from "@/modules/auth/authChannelPolicy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_SESSION = { user: { userId: randomUUID(), role: "admin" as const } };
const DOCTOR_SESSION = { user: { userId: randomUUID(), role: "doctor" as const } };
const PATIENT_SESSION = { user: { userId: randomUUID(), role: "client" as const } };
const VALID_UUID = randomUUID();
const ORG_ID = randomUUID();
const CANONICAL_UUID = randomUUID();

function makeAdminRequest(body: unknown) {
  return new Request(`http://localhost/api/doctor/patients/${VALID_UUID}/email-change`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest() {
  return new Request(`http://localhost/api/doctor/patients/${VALID_UUID}/email-change`, {
    method: "GET",
  });
}

function makePatientConfirmRequest(body: unknown) {
  return new Request("http://localhost/api/patient/email-change/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FAKE_PARAMS = { params: Promise.resolve({ userId: VALID_UUID }) };

// ---------------------------------------------------------------------------
// Tests: Admin POST (initiate email change)
// ---------------------------------------------------------------------------

describe("POST /api/doctor/patients/[userId]/email-change", () => {
  beforeEach(() => {
    // The confirm route now goes through an approved guard instead of reading the session itself.
    // Keep the tests' existing lever (getCurrentSessionMock) authoritative: the guard simply reflects
    // whatever session the case set up, so "not authenticated" still means "no session".
    requirePatientApiSessionMock.mockReset();
    requirePatientApiSessionMock.mockImplementation(async () => {
      const session = await getCurrentSessionMock();
      return session
        ? { ok: true as const, session }
        : {
            ok: false as const,
            response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            }),
          };
    });
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockReset();
    buildAppDepsMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    startEmailChallengeMock.mockReset();
    normalizeEmailMock.mockReset();
    normalizeEmailMock.mockImplementation((email: string) => email.trim().toLowerCase());
    ensureAuthModulePortsBoundMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: ADMIN_SESSION,
      },
    });
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: CANONICAL_UUID });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization: getClientIdentityForOrganizationMock },
    });
  });

  it("returns 401 when not authenticated", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });

    const res = await adminPost(makeAdminRequest({ email: "new@example.com" }), FAKE_PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is doctor (not admin)", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: true,
      ctx: { organizationId: ORG_ID, session: DOCTOR_SESSION },
    });

    const res = await adminPost(makeAdminRequest({ email: "new@example.com" }), FAKE_PARAMS);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("forbidden");
  });

  it("rejects a disabled email channel after authorization but before patient lookup or send", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(false);
    try {
      const res = await adminPost(makeAdminRequest({ email: "new@example.com" }), FAKE_PARAMS);

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
      expect(requireDoctorWorkspaceApiContextMock).toHaveBeenCalledOnce();
      expect(buildAppDepsMock).not.toHaveBeenCalled();
      expect(getClientIdentityForOrganizationMock).not.toHaveBeenCalled();
      expect(startEmailChallengeMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it("returns 400 for invalid email", async () => {
    const res = await adminPost(makeAdminRequest({ email: "not-an-email" }), FAKE_PARAMS);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("validation_error");
  });

  it("returns 404 and does not start challenge outside selected workspace", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);

    const res = await adminPost(makeAdminRequest({ email: "patient-new@example.com" }), FAKE_PARAMS);

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(VALID_UUID, ORG_ID);
    expect(startEmailChallengeMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("admin can initiate email change — returns pending email and expiresAt", async () => {
    startEmailChallengeMock.mockResolvedValueOnce({
      ok: true,
      challengeId: randomUUID(),
      retryAfterSeconds: 60,
    });

    const res = await adminPost(makeAdminRequest({ email: "patient-new@example.com" }), FAKE_PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; pending: { email: string; expiresAt: string } };
    expect(body.ok).toBe(true);
    expect(body.pending.email).toBe("patient-new@example.com");
    expect(typeof body.pending.expiresAt).toBe("string");
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(VALID_UUID, ORG_ID);
    expect(startEmailChallengeMock).toHaveBeenCalledWith(CANONICAL_UUID, "patient-new@example.com", "patient_email_change");
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it("returns 429 on rate_limited", async () => {
    startEmailChallengeMock.mockResolvedValueOnce({
      ok: false,
      code: "rate_limited",
      retryAfterSeconds: 30,
    });

    const res = await adminPost(makeAdminRequest({ email: "p@example.com" }), FAKE_PARAMS);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("returns 503 on email_send_failed", async () => {
    startEmailChallengeMock.mockResolvedValueOnce({ ok: false, code: "email_send_failed" });

    const res = await adminPost(makeAdminRequest({ email: "p@example.com" }), FAKE_PARAMS);
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Tests: Admin GET (check pending)
// ---------------------------------------------------------------------------

describe("GET /api/doctor/patients/[userId]/email-change", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockReset();
    buildAppDepsMock.mockReset();
    getClientIdentityForOrganizationMock.mockReset();
    getPendingEmailChallengeMock.mockReset();
    ensureAuthModulePortsBoundMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: ADMIN_SESSION,
      },
    });
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: CANONICAL_UUID });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization: getClientIdentityForOrganizationMock },
    });
  });

  it("returns 403 when role is doctor (not admin)", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: true,
      ctx: { organizationId: ORG_ID, session: DOCTOR_SESSION },
    });

    const res = await adminGet(makeGetRequest(), FAKE_PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 and does not read pending challenge outside selected workspace", async () => {
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);

    const res = await adminGet(makeGetRequest(), FAKE_PARAMS);

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith(VALID_UUID, ORG_ID);
    expect(getPendingEmailChallengeMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("returns pending challenge when one exists", async () => {
    getPendingEmailChallengeMock.mockResolvedValueOnce({
      email: "pending@example.com",
      expiresAt: "2026-06-15T12:00:00.000Z",
    });

    const res = await adminGet(makeGetRequest(), FAKE_PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; pending: { email: string; expiresAt: string } | null };
    expect(body.ok).toBe(true);
    expect(body.pending).toEqual({ email: "pending@example.com", expiresAt: "2026-06-15T12:00:00.000Z" });
    expect(getPendingEmailChallengeMock).toHaveBeenCalledWith(CANONICAL_UUID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it("returns null when no pending challenge", async () => {
    getPendingEmailChallengeMock.mockResolvedValueOnce(null);

    const res = await adminGet(makeGetRequest(), FAKE_PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; pending: null };
    expect(body.ok).toBe(true);
    expect(body.pending).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Patient confirm
// ---------------------------------------------------------------------------

describe("POST /api/patient/email-change/confirm", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    confirmLatestEmailChallengeCodeForUserMock.mockReset();
    ensureAuthModulePortsBoundMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
  });

  it("returns 401 when not authenticated", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    const res = await patientConfirmPost(makePatientConfirmRequest({ code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("rejects a disabled email channel before pending-code consumption or mutation", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(false);
    getCurrentSessionMock.mockResolvedValueOnce(PATIENT_SESSION);
    try {
      const res = await patientConfirmPost(makePatientConfirmRequest({ code: "123456" }));

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
      expect(confirmLatestEmailChallengeCodeForUserMock).not.toHaveBeenCalled();
      expect(getCurrentDbPrincipalOrganizationIdMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it("returns 400 when no pending challenge (expired_code)", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(PATIENT_SESSION);
    confirmLatestEmailChallengeCodeForUserMock.mockResolvedValueOnce({ ok: false, code: "expired_code" });

    const res = await patientConfirmPost(makePatientConfirmRequest({ code: "123456" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("expired_code");
  });

  it("returns 400 for incorrect code", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(PATIENT_SESSION);
    confirmLatestEmailChallengeCodeForUserMock.mockResolvedValueOnce({ ok: false, code: "invalid_code" });

    const res = await patientConfirmPost(makePatientConfirmRequest({ code: "000000" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_code");
  });

  it("returns 200 on correct code — email switched", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(PATIENT_SESSION);
    confirmLatestEmailChallengeCodeForUserMock.mockResolvedValueOnce({ ok: true });

    const res = await patientConfirmPost(makePatientConfirmRequest({ code: "654321" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(confirmLatestEmailChallengeCodeForUserMock).toHaveBeenCalledWith(
      PATIENT_SESSION.user.userId,
      "654321",
      "patient_email_change",
      { profileBindOrganizationId: ORG_ID },
    );
  });

  it("returns 429 on too_many_attempts", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(PATIENT_SESSION);
    confirmLatestEmailChallengeCodeForUserMock.mockResolvedValueOnce({
      ok: false,
      code: "too_many_attempts",
      retryAfterSeconds: 300,
    });

    const res = await patientConfirmPost(makePatientConfirmRequest({ code: "999999" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
  });

  it("returns 409 on email_conflict", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(PATIENT_SESSION);
    confirmLatestEmailChallengeCodeForUserMock.mockResolvedValueOnce({ ok: false, code: "email_conflict" });

    const res = await patientConfirmPost(makePatientConfirmRequest({ code: "123456" }));
    expect(res.status).toBe(409);
  });
});
