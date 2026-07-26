import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMock = vi.hoisted(() => vi.fn());
const resolveUserMock = vi.hoisted(() => vi.fn());
const createBookingMock = vi.hoisted(() => vi.fn());
const recordMergeMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());
const verifyCodeMock = vi.hoisted(() => vi.fn());
const challengeGetMock = vi.hoisted(() => vi.fn());
const challengeDeleteMock = vi.hoisted(() => vi.fn());

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111112";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";
const EXISTING_PHONE = "+79001234567";

vi.mock("@/modules/public-booking/publicBookingRateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/public-booking/publicBookingRateLimit")>();
  return {
    ...actual,
    resolvePublicBookingRateLimitClientKey: () => ({ ok: true, key: "127.0.0.1" }),
    isPublicBookingConfirmRateLimited: (...args: unknown[]) => rateLimitMock(...args),
  };
});
vi.mock("@/app-layer/platform-user/resolveOrCreateUserByPhone", () => ({ resolveOrCreateUserByPhone: (...args: unknown[]) => resolveUserMock(...args) }));
vi.mock("@/app-layer/platform-user/recordPublicBookingMergeCandidates", () => ({ recordPublicBookingMergeCandidates: (...args: unknown[]) => recordMergeMock(...args) }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientBooking: { createBooking: createBookingMock },
    bookingEngine: { catalog: { getBranch: getBranchMock }, services: { getService: getServiceMock } },
    bookingScheduling: { resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock },
    publicBookingVerification: {
      smsPort: { sendCode: vi.fn(), verifyCode: verifyCodeMock },
      challengeStore: { get: challengeGetMock, set: vi.fn(), delete: challengeDeleteMock },
    },
  }),
}));
vi.mock("@/app-layer/db/client", () => ({ getPool: () => ({}) }));

import { POST } from "./route";
import { PUBLIC_BOOKING_INTENT_VERSION } from "@/modules/public-booking/publicBookingIntent";

function intent(overrides: Record<string, unknown> = {}) {
  return {
    v: PUBLIC_BOOKING_INTENT_VERSION,
    organizationId: ORG_ID,
    branchId: BRANCH_ID,
    serviceId: SERVICE_ID,
    slotStart: "2026-06-01T10:00:00.000Z",
    slotEnd: "2026-06-01T11:00:00.000Z",
    contactName: "Иван",
    contactPhone: EXISTING_PHONE,
    ...overrides,
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/booking/public/create/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/booking/public/create/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue(false);
    resolveUserMock.mockResolvedValue({ ok: true, userId: "user-1" });
    createBookingMock.mockResolvedValue({ id: "pb-1", userId: "user-1", status: "confirmed", canonicalAppointmentId: "appt-1" });
    recordMergeMock.mockResolvedValue(undefined);
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID, cityCode: "moscow" });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
    verifyCodeMock.mockResolvedValue({ ok: true });
    challengeGetMock.mockResolvedValue({
      phone: EXISTING_PHONE,
      expiresAt: 9e9,
      deliveryChannel: "sms",
      publicBookingIntent: intent(),
    });
    challengeDeleteMock.mockResolvedValue(undefined);
  });

  it("creates the booking from the pinned intent once the code verifies", async () => {
    const response = await POST(request({ challengeId: "chal-1", code: "123456" }));

    expect(response.status).toBe(200);
    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID, contactPhone: EXISTING_PHONE }),
    );
  });

  it("still hides the person's identifier after a successful confirm", async () => {
    const response = await POST(request({ challengeId: "chal-1", code: "123456" }));
    const text = await response.text();

    expect(text).not.toContain("userId");
    expect(text).not.toContain("user-1");
  });

  describe("no trust without proof of control of the PHONE", () => {
    it("stamps trust when the code came by SMS", async () => {
      await POST(request({ challengeId: "chal-1", code: "123456" }));
      expect(resolveUserMock).toHaveBeenCalledWith(EXISTING_PHONE, "Иван", true);
    });

    it.each(["email", "telegram", "max", undefined] as const)(
      "does NOT stamp phone trust when the code came by %s",
      async (channel) => {
        challengeGetMock.mockResolvedValue({
          phone: EXISTING_PHONE,
          expiresAt: 9e9,
          deliveryChannel: channel,
          publicBookingIntent: intent(),
        });

        await POST(request({ challengeId: "chal-1", code: "123456" }));

        expect(resolveUserMock).toHaveBeenCalledWith(EXISTING_PHONE, "Иван", false);
      },
    );
  });

  describe("the code is the gate, and it is single use", () => {
    it("creates nothing when the code does not verify", async () => {
      verifyCodeMock.mockResolvedValue({ ok: false, code: "invalid_code" });

      const response = await POST(request({ challengeId: "chal-1", code: "000000" }));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: "verification_failed" });
      expect(createBookingMock).not.toHaveBeenCalled();
      expect(resolveUserMock).not.toHaveBeenCalled();
    });

    it("gives one answer for wrong, expired, unknown and exhausted alike", async () => {
      const answers: string[] = [];
      for (const setup of [
        () => verifyCodeMock.mockResolvedValueOnce({ ok: false, code: "invalid_code" }),
        () => verifyCodeMock.mockResolvedValueOnce({ ok: false, code: "expired_code" }),
        () => verifyCodeMock.mockResolvedValueOnce({ ok: false, code: "too_many_attempts" }),
        () => challengeGetMock.mockResolvedValueOnce(null),
        () => challengeGetMock.mockResolvedValueOnce({ phone: EXISTING_PHONE, expiresAt: 9e9 }),
      ]) {
        setup();
        const response = await POST(request({ challengeId: "chal-1", code: "000000" }));
        answers.push(`${response.status}:${(await response.json()).error}`);
      }

      expect(new Set(answers).size).toBe(1);
      expect(answers[0]).toBe("400:verification_failed");
    });

    it("spends the challenge so one code cannot be redeemed twice", async () => {
      await POST(request({ challengeId: "chal-1", code: "123456" }));
      expect(challengeDeleteMock).toHaveBeenCalledWith("chal-1");
    });

    it("does not consult the challenge store at all once the confirm limit is hit", async () => {
      rateLimitMock.mockResolvedValue(true);

      const response = await POST(request({ challengeId: "chal-1", code: "123456" }));

      expect(response.status).toBe(429);
      expect(verifyCodeMock).not.toHaveBeenCalled();
      expect(createBookingMock).not.toHaveBeenCalled();
    });
  });

  it("re-verifies the tenant binding at confirm time and refuses a drifted one", async () => {
    // Ten minutes later the branch/service belong to another clinic than the intent claims.
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: OTHER_ORG_ID, cityCode: "moscow" });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: OTHER_ORG_ID });
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: OTHER_ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });

    const response = await POST(request({ challengeId: "chal-1", code: "123456" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "ambiguous_booking_tenant" });
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("rejects a body that tries to restate the booking instead of just the code", async () => {
    const response = await POST(request({ challengeId: "chal-1" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "invalid_body" });
  });

  it("maps booking_blocked to 403 here, where the caller has proved the phone is theirs", async () => {
    createBookingMock.mockRejectedValueOnce(new Error("booking_blocked"));

    const response = await POST(request({ challengeId: "chal-1", code: "123456" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: "booking_blocked" });
  });

  it("redacts an unknown exception behind fixed create_failed", async () => {
    createBookingMock.mockRejectedValueOnce(new Error("patient@example.test SQLSTATE 23505"));

    const response = await POST(request({ challengeId: "chal-1", code: "123456" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "create_failed" });
  });
});
