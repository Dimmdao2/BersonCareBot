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
  requireDoctorApiSessionMock,
  startEmailChallengeMock,
  normalizeEmailMock,
  getPendingEmailChallengeMock,
  confirmLatestEmailChallengeCodeForUserMock,
  ensureAuthModulePortsBoundMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  requireDoctorApiSessionMock: vi.fn(),
  startEmailChallengeMock: vi.fn(),
  normalizeEmailMock: vi.fn((email: string) => email.trim().toLowerCase()),
  getPendingEmailChallengeMock: vi.fn(),
  confirmLatestEmailChallengeCodeForUserMock: vi.fn(),
  ensureAuthModulePortsBoundMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorApiSession: (...args: unknown[]) => requireDoctorApiSessionMock(...args),
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

import { POST as adminPost, GET as adminGet } from "./route";
import { POST as patientConfirmPost } from "@/app/api/patient/email-change/confirm/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_SESSION = { user: { userId: randomUUID(), role: "admin" as const } };
const DOCTOR_SESSION = { user: { userId: randomUUID(), role: "doctor" as const } };
const PATIENT_SESSION = { user: { userId: randomUUID(), role: "client" as const } };
const VALID_UUID = randomUUID();

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
    requireDoctorApiSessionMock.mockReset();
    startEmailChallengeMock.mockReset();
    normalizeEmailMock.mockReset();
    normalizeEmailMock.mockImplementation((email: string) => email.trim().toLowerCase());
    ensureAuthModulePortsBoundMock.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    requireDoctorApiSessionMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });

    const res = await adminPost(makeAdminRequest({ email: "new@example.com" }), FAKE_PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is doctor (not admin)", async () => {
    requireDoctorApiSessionMock.mockResolvedValueOnce({ ok: true, session: DOCTOR_SESSION });

    const res = await adminPost(makeAdminRequest({ email: "new@example.com" }), FAKE_PARAMS);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("forbidden");
  });

  it("returns 400 for invalid email", async () => {
    requireDoctorApiSessionMock.mockResolvedValueOnce({ ok: true, session: ADMIN_SESSION });

    const res = await adminPost(makeAdminRequest({ email: "not-an-email" }), FAKE_PARAMS);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("validation_error");
  });

  it("admin can initiate email change — returns pending email and expiresAt", async () => {
    requireDoctorApiSessionMock.mockResolvedValueOnce({ ok: true, session: ADMIN_SESSION });
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
    expect(startEmailChallengeMock).toHaveBeenCalledWith(VALID_UUID, "patient-new@example.com");
  });

  it("returns 429 on rate_limited", async () => {
    requireDoctorApiSessionMock.mockResolvedValueOnce({ ok: true, session: ADMIN_SESSION });
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
    requireDoctorApiSessionMock.mockResolvedValueOnce({ ok: true, session: ADMIN_SESSION });
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
    requireDoctorApiSessionMock.mockReset();
    getPendingEmailChallengeMock.mockReset();
    ensureAuthModulePortsBoundMock.mockReset();
  });

  it("returns 403 when role is doctor (not admin)", async () => {
    requireDoctorApiSessionMock.mockResolvedValueOnce({ ok: true, session: DOCTOR_SESSION });

    const res = await adminGet(makeGetRequest(), FAKE_PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns pending challenge when one exists", async () => {
    requireDoctorApiSessionMock.mockResolvedValueOnce({ ok: true, session: ADMIN_SESSION });
    getPendingEmailChallengeMock.mockResolvedValueOnce({
      email: "pending@example.com",
      expiresAt: "2026-06-15T12:00:00.000Z",
    });

    const res = await adminGet(makeGetRequest(), FAKE_PARAMS);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; pending: { email: string; expiresAt: string } | null };
    expect(body.ok).toBe(true);
    expect(body.pending).toEqual({ email: "pending@example.com", expiresAt: "2026-06-15T12:00:00.000Z" });
  });

  it("returns null when no pending challenge", async () => {
    requireDoctorApiSessionMock.mockResolvedValueOnce({ ok: true, session: ADMIN_SESSION });
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
  });

  it("returns 401 when not authenticated", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    const res = await patientConfirmPost(makePatientConfirmRequest({ code: "123456" }));
    expect(res.status).toBe(401);
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
