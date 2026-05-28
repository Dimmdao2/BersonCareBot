import { describe, expect, it, vi, beforeEach } from "vitest";

const resolveLoginChallengeMock = vi.hoisted(() => vi.fn());
const confirmPhoneAuthMock = vi.hoisted(() => vi.fn());
const setSessionFromUserMock = vi.hoisted(() => vi.fn());
const trySetInitialIfEmptyMock = vi.hoisted(() => vi.fn());
const getCurrentSessionMock = vi.hoisted(() => vi.fn());

const getPhoneChallengeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    phoneMessengerBind: {
      resolveLoginChallenge: (...args: unknown[]) => resolveLoginChallengeMock(...args),
    },
    auth: {
      getPhoneChallenge: (...args: unknown[]) => getPhoneChallengeMock(...args),
      confirmPhoneAuth: (...args: unknown[]) => confirmPhoneAuthMock(...args),
      setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
    },
    patientCalendarTimezone: {
      trySetInitialIfEmpty: (...args: unknown[]) => trySetInitialIfEmptyMock(...args),
    },
  }),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

import { POST } from "./route";

describe("POST /api/auth/phone/messenger-bind/finish", () => {
  beforeEach(() => {
    resolveLoginChallengeMock.mockReset();
    confirmPhoneAuthMock.mockReset();
    setSessionFromUserMock.mockReset();
    trySetInitialIfEmptyMock.mockReset();
    getCurrentSessionMock.mockReset();
    getPhoneChallengeMock.mockReset();
    getCurrentSessionMock.mockResolvedValue(null);
    getPhoneChallengeMock.mockResolvedValue({ isRegistrationIntent: false, phone: "+79991234567" });
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when OTP code is sent in body", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc", code: "123456" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(resolveLoginChallengeMock).not.toHaveBeenCalled();
  });

  it("returns 404 when secret not found", async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: "not_found" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_missing" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when challenge_expired", async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: "challenge_expired" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 when wrong_purpose", async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: "wrong_purpose" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when not_ready", async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: "not_ready" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 200 with redirect when already_consumed and session exists", async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: "already_consumed" });
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u-1", role: "client", phone: "+79991234567" },
    });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; redirectTo?: string };
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBeTruthy();
    expect(confirmPhoneAuthMock).not.toHaveBeenCalled();
  });

  it("returns 409 when already_consumed without session", async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: "already_consumed" });
    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("creates session on successful finish", async () => {
    resolveLoginChallengeMock.mockResolvedValue({
      ok: true,
      challengeId: "ch-1",
      code: "654321",
    });
    confirmPhoneAuthMock.mockResolvedValue({
      ok: true,
      user: { userId: "u-1", role: "client", phone: "+79991234567" },
      redirectTo: "/app/patient/home",
      deliveryChannel: "telegram",
    });
    setSessionFromUserMock.mockResolvedValue(undefined);
    trySetInitialIfEmptyMock.mockResolvedValue(undefined);

    const res = await POST(
      new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: "auth_abc", browserCalendarIana: "Europe/Moscow" }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; redirectTo?: string; role?: string };
    expect(data).toMatchObject({ ok: true, redirectTo: "/app/patient/home", role: "client" });
    expect(confirmPhoneAuthMock).toHaveBeenCalledWith("ch-1", "654321");
    expect(setSessionFromUserMock).toHaveBeenCalled();
    expect(trySetInitialIfEmptyMock).toHaveBeenCalledWith("u-1", "Europe/Moscow");
  });

  it("second finish is idempotent after first consumed the challenge", async () => {
    let confirmCalls = 0;
    confirmPhoneAuthMock.mockImplementation(async () => {
      confirmCalls += 1;
      return {
        ok: true,
        user: { userId: "u-1", role: "client", phone: "+79991234567" },
        redirectTo: "/app/patient/home",
        deliveryChannel: "telegram",
      };
    });
    resolveLoginChallengeMock.mockImplementation(async () => {
      if (confirmCalls > 0) {
        return { ok: false, code: "already_consumed" };
      }
      return { ok: true, challengeId: "ch-1", code: "654321" };
    });
    setSessionFromUserMock.mockResolvedValue(undefined);
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u-1", role: "client", phone: "+79991234567" },
    });

    const req = () =>
      POST(
        new Request("http://localhost/api/auth/phone/messenger-bind/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ setupToken: "auth_abc" }),
        }),
      );

    const first = await req();
    const second = await req();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(confirmPhoneAuthMock).toHaveBeenCalledTimes(1);
  });
});
