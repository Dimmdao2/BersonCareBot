import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const rateLimitMock = vi.hoisted(() => vi.fn());
const resolveUserMock = vi.hoisted(() => vi.fn());
const createBookingMock = vi.hoisted(() => vi.fn());
const recordMergeMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());
const consumeChallengeMock = vi.hoisted(() => vi.fn());

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111112";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";
const EXISTING_PHONE = "+79001234567";
let organizationSeenByFinalWrite: string | undefined;

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
      otp: { issueChallenge: vi.fn(), consumeChallenge: consumeChallengeMock },
      deliverCode: vi.fn(),
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
    organizationSeenByFinalWrite = undefined;
    rateLimitMock.mockResolvedValue(false);
    resolveUserMock.mockResolvedValue({ ok: true, userId: "user-1" });
    createBookingMock.mockResolvedValue({ id: "pb-1", userId: "user-1", status: "confirmed", canonicalAppointmentId: "appt-1" });
    recordMergeMock.mockImplementation(async () => {
      organizationSeenByFinalWrite = getCurrentDbPrincipalOrganizationId();
    });
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID, cityCode: "moscow" });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
    // The accessor verifies the code, spends the challenge and hands back only the pinned intent
    // and the delivery channel — never the code, never a row.
    consumeChallengeMock.mockResolvedValue({ ok: true, intent: intent(), deliveryChannel: "sms" });
  });

  it("creates the booking from the pinned intent once the code verifies", async () => {
    const response = await POST(request({ challengeId: "chal-1", code: "123456" }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(
      '{"ok":true,"booking":{"id":"pb-1","status":"confirmed","canonicalAppointmentId":"appt-1"}}',
    );
    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID, contactPhone: EXISTING_PHONE }),
    );
    expect(organizationSeenByFinalWrite).toBe(ORG_ID);
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
        consumeChallengeMock.mockResolvedValue({
          ok: true,
          intent: intent(),
          deliveryChannel: channel,
        });

        await POST(request({ challengeId: "chal-1", code: "123456" }));

        expect(resolveUserMock).toHaveBeenCalledWith(EXISTING_PHONE, "Иван", false);
      },
    );
  });

  describe("the code is the gate, and it is single use", () => {
    it("creates nothing when the code does not verify", async () => {
      consumeChallengeMock.mockResolvedValue({ ok: false });

      const response = await POST(request({ challengeId: "chal-1", code: "000000" }));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: "verification_failed" });
      expect(createBookingMock).not.toHaveBeenCalled();
      expect(resolveUserMock).not.toHaveBeenCalled();
    });

    it("gives one answer for wrong, expired, unknown and exhausted alike", async () => {
      const answers: string[] = [];
      for (const setup of [
        // Wrong code, expired, unknown id, exhausted attempts and "challenge carries no booking
        // intent" are ONE `ok: false` at the accessor boundary by construction — the only extra
        // field the lockout branch can add is the caller's own retry countdown.
        () => consumeChallengeMock.mockResolvedValueOnce({ ok: false }),
        () => consumeChallengeMock.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 600 }),
        // An intent the accessor returned but that no longer parses (version bump / tampering)
        // must land on the same answer, not a distinguishable one.
        () => consumeChallengeMock.mockResolvedValueOnce({ ok: true, intent: { v: 99 }, deliveryChannel: "sms" }),
        () => consumeChallengeMock.mockResolvedValueOnce({ ok: true, intent: null, deliveryChannel: "sms" }),
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
      // Consuming IS the verification: the accessor deletes the row in the same transaction that
      // accepts the code, so there is no second app-level step that could be skipped or lost.
      expect(consumeChallengeMock).toHaveBeenCalledWith("chal-1", "123456", expect.any(Number), expect.any(Number));
    });

    it("does not consult the challenge store at all once the confirm limit is hit", async () => {
      rateLimitMock.mockResolvedValue(true);

      const response = await POST(request({ challengeId: "chal-1", code: "123456" }));

      expect(response.status).toBe(429);
      expect(consumeChallengeMock).not.toHaveBeenCalled();
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
    await expect(response.text()).resolves.toBe('{"ok":false,"error":"booking_blocked"}');
  });

  it("redacts an unknown exception behind fixed create_failed", async () => {
    createBookingMock.mockRejectedValueOnce(new Error("patient@example.test SQLSTATE 23505"));

    const response = await POST(request({ challengeId: "chal-1", code: "123456" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "create_failed" });
  });
});
