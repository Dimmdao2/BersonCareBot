import { beforeEach, describe, expect, it, vi } from "vitest";

const setSessionFromUserMock = vi.fn().mockResolvedValue(undefined);
const trySetInitialIfEmptyMock = vi.fn().mockResolvedValue(undefined);
const confirmPublicEmailOtpChallengeMock = vi.fn();
const findByUserIdMock = vi.fn();

const testUser = {
  userId: "user-uuid-1",
  role: "client" as const,
  displayName: "Test User",
  phone: null,
  bindings: {},
};

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    emailOtpPublicDb: {},
    userByPhone: {
      findByUserId: (...args: unknown[]) => findByUserIdMock(...args),
    },
    patientCalendarTimezone: {
      trySetInitialIfEmpty: trySetInitialIfEmptyMock,
    },
  }),
}));

vi.mock("@/modules/auth/emailOtpPublic", () => ({
  confirmPublicEmailOtpChallenge: (...args: unknown[]) => confirmPublicEmailOtpChallengeMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
}));

import { POST } from "./route";

describe("POST /api/auth/email-otp/confirm", () => {
  beforeEach(() => {
    confirmPublicEmailOtpChallengeMock.mockReset();
    findByUserIdMock.mockReset();
    setSessionFromUserMock.mockClear();
    trySetInitialIfEmptyMock.mockClear();

    findByUserIdMock.mockResolvedValue(testUser);
    confirmPublicEmailOtpChallengeMock.mockResolvedValue({
      ok: true as const,
      userId: testUser.userId,
    });
  });

  it("returns 400 when email or code is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
  });

  it("returns 200 and sets session on correct code", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", code: "123456" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe("/app/patient");
    expect(data.role).toBe("client");
    expect(setSessionFromUserMock).toHaveBeenCalledWith(testUser);
  });

  it("returns 400 on invalid code", async () => {
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({ ok: false, code: "invalid_code" });
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", code: "000000" }),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("invalid_code");
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
  });

  it("returns 400 on expired code", async () => {
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({ ok: false, code: "expired_code" });
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", code: "123456" }),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("expired_code");
  });

  it("returns 429 on too_many_attempts", async () => {
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({
      ok: false,
      code: "too_many_attempts",
      retryAfterSeconds: 300,
    });
    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", code: "999999" }),
      }),
    );
    expect(res.status).toBe(429);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe("too_many_attempts");
    expect(data.retryAfterSeconds).toBe(300);
  });

  it("existing user with email (doctor needs_email_setup) logs in, not creates duplicate", async () => {
    const doctorUser = {
      userId: "doctor-uuid-99",
      role: "doctor" as const,
      displayName: "Dr. Smith",
      phone: "+79991234567",
      bindings: {},
    };
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({
      ok: true as const,
      userId: doctorUser.userId,
    });
    findByUserIdMock.mockResolvedValueOnce(doctorUser);

    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "doctor@example.com", code: "654321" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.role).toBe("doctor");
    expect(setSessionFromUserMock).toHaveBeenCalledWith(doctorUser);
  });

  it("new user created on the fly and logged in", async () => {
    // The service creates user at start time (findOrCreate); by confirm time the user exists.
    // From route perspective: confirmPublicEmailOtpChallenge returns a userId (could be newly created)
    const newUser = {
      userId: "new-user-uuid-42",
      role: "client" as const,
      displayName: "user42",
      phone: null,
      bindings: {},
    };
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({
      ok: true as const,
      userId: newUser.userId,
    });
    findByUserIdMock.mockResolvedValueOnce(newUser);

    const res = await POST(
      new Request("http://localhost/api/auth/email-otp/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "newbie@example.com", code: "111222" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(setSessionFromUserMock).toHaveBeenCalledWith(newUser);
  });
});
