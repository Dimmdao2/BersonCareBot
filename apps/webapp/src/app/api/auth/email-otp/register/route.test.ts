import { beforeEach, describe, expect, it, vi } from "vitest";

const startPublicEmailOtpRegistrationMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: () => ({ emailOtpPublicDb: {} }) }));
vi.mock("@/modules/auth/emailOtpPublic", () => ({
  startPublicEmailOtpRegistration: (...args: unknown[]) => startPublicEmailOtpRegistrationMock(...args),
}));

import { POST } from "./route";
import * as authChannelPolicy from "@/modules/auth/authChannelPolicy";

function request(body: unknown, ip = "10.2.0.1") {
  return new Request("http://localhost/api/auth/email-otp/register", {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body),
  });
}

describe("POST /api/auth/email-otp/register", () => {
  beforeEach(() => {
    startPublicEmailOtpRegistrationMock.mockReset();
    startPublicEmailOtpRegistrationMock.mockResolvedValue({ ok: true, challengeId: "registration-challenge", retryAfterSeconds: 60 });
  });

  it("rejects a disabled email channel before registration work", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(false);
    try {
      const response = await POST(request({
        email: "patient@example.com",
        lastName: "Иванов",
        firstName: "Иван",
      }, "10.2.0.6"));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
      expect(startPublicEmailOtpRegistrationMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it("rejects missing or blank required FIO before the domain path", async () => {
    const missing = await POST(request({ email: "patient@example.com", firstName: "Иван" }, "10.2.0.2"));
    expect(missing.status).toBe(400);
    const blank = await POST(request({ email: "patient@example.com", lastName: " ", firstName: "Иван" }, "10.2.0.3"));
    expect(blank.status).toBe(400);
    expect(startPublicEmailOtpRegistrationMock).not.toHaveBeenCalled();
  });

  it("accepts optional patronymic and starts a structured patient registration", async () => {
    const response = await POST(request({ email: "patient@example.com", lastName: "Иванов", firstName: "Иван" }, "10.2.0.4"));
    expect(response.status).toBe(200);
    expect(startPublicEmailOtpRegistrationMock).toHaveBeenCalledWith(
      { email: "patient@example.com", lastName: "Иванов", firstName: "Иван" },
      {},
    );
  });

  it("does not allow registration to overwrite a verified duplicate", async () => {
    startPublicEmailOtpRegistrationMock.mockResolvedValueOnce({ ok: false, code: "duplicate_email" });
    const response = await POST(request({ email: "patient@example.com", lastName: "Иванов", firstName: "Иван" }, "10.2.0.5"));
    expect(response.status).toBe(409);
    expect((await response.json() as { error: string }).error).toBe("duplicate_email");
  });
});
