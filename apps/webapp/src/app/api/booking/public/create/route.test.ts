import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const rateLimitMock = vi.hoisted(() => vi.fn());
const resolveUserMock = vi.hoisted(() => vi.fn());
const createBookingMock = vi.hoisted(() => vi.fn());
const recordMergeMock = vi.hoisted(() => vi.fn());
const resolvePublicBookingOrganizationMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const resolveOrganizationIdBySlugMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());
const issueChallengeMock = vi.hoisted(() => vi.fn());
const deliverCodeMock = vi.hoisted(() => vi.fn());
const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const isBookingBlockedMock = vi.hoisted(() => vi.fn());
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440001";
const SERVICE_ID = "550e8400-e29b-41d4-a716-446655440002";
let organizationSeenByFinalWrite: string | undefined;

vi.mock("@/modules/public-booking/publicBookingRateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/public-booking/publicBookingRateLimit")>();
  return {
    ...actual,
    resolvePublicBookingRateLimitClientKey: () => ({ ok: true, key: "127.0.0.1" }),
    isPublicBookingCreateRateLimited: (...args: unknown[]) => rateLimitMock(...args),
  };
});
vi.mock("@/app-layer/platform-user/resolveOrCreateUserByPhone", () => ({ resolveOrCreateUserByPhone: (...args: unknown[]) => resolveUserMock(...args) }));
vi.mock("@/app-layer/platform-user/recordPublicBookingMergeCandidates", () => ({ recordPublicBookingMergeCandidates: (...args: unknown[]) => recordMergeMock(...args) }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: { getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args) },
    patientBooking: { createBooking: createBookingMock },
    clinicDirectory: { resolveOrganizationIdBySlug: resolveOrganizationIdBySlugMock },
    bookingEngine: { catalog: { getBranch: getBranchMock }, services: { getService: getServiceMock } },
    bookingScheduling: { resolvePublicBookingOrganization: resolvePublicBookingOrganizationMock, resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock },
    clientHistory: { assertSelfServiceBookingAllowed: isBookingBlockedMock },
    publicBookingVerification: {
      otp: { issueChallenge: issueChallengeMock, consumeChallenge: vi.fn() },
      deliverCode: deliverCodeMock,
    },
  }),
}));
vi.mock("@/app-layer/db/client", () => ({ getPool: () => ({}) }));

import { POST } from "./route";
import { InPersonBookingResolveError } from "@/modules/patient-booking/inPersonBookingResolve";

const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111112";

/** A phone that already belongs to somebody. Nothing on this path may act on that fact. */
const EXISTING_PHONE = "+79001234567";
/** A phone nobody has ever used. */
const UNKNOWN_PHONE = "+79007654321";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/booking/public/create", { method: "POST", headers: { "Content-Type": "application/json", "X-Real-IP": "1.2.3.4" }, body: JSON.stringify(body) });
}

function inPersonBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "in_person",
    orgSlug: "clinic-a",
    branchId: BRANCH_ID,
    serviceId: SERVICE_ID,
    slotStart: "2026-06-01T10:00:00.000Z",
    slotEnd: "2026-06-01T11:00:00.000Z",
    contactName: "Иван",
    contactPhone: EXISTING_PHONE,
    ...overrides,
  };
}

describe("POST /api/booking/public/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationSeenByFinalWrite = undefined;
    rateLimitMock.mockResolvedValue(false);
    resolveUserMock.mockResolvedValue({ ok: true, userId: "user-1" });
    createBookingMock.mockResolvedValue({ id: "pb-1", userId: "user-1", canonicalAppointmentId: "appt-1", status: "confirmed" });
    recordMergeMock.mockImplementation(async () => {
      organizationSeenByFinalWrite = getCurrentDbPrincipalOrganizationId();
    });
    resolvePublicBookingOrganizationMock.mockResolvedValue(ORG_ID);
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_ID);
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: ORG_ID, cityCode: "moscow" });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: ORG_ID });
    getCurrentSessionMock.mockResolvedValue(null);
    isBookingBlockedMock.mockResolvedValue(undefined);
    issueChallengeMock.mockResolvedValue(true);
    deliverCodeMock.mockResolvedValue({ ok: true });
  });

  it("asks for a code instead of creating the booking, and does not touch the person", async () => {
    const response = await POST(request(inPersonBody({ attribution: { utmSource: "tilda" } })));

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toMatch(
      /^\{"ok":true,"verification":\{"challengeId":"[^"]+","expiresInSeconds":600,"retryAfterSeconds":60\}\}$/,
    );
    const json = JSON.parse(text);
    // The id is minted server-side per request; the caller only has to be handed one.
    expect(typeof json.verification.challengeId).toBe("string");
    expect(json.verification.challengeId.length).toBeGreaterThan(0);
    expect(json.booking).toBeUndefined();
    // The whole hole in one assertion: nothing resolved a person from the submitted phone.
    expect(resolveUserMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("pins the tenant-resolved booking to the challenge, not to anything the caller can restate", async () => {
    await POST(request(inPersonBody()));

    expect(issueChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          organizationId: ORG_ID,
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
          contactPhone: EXISTING_PHONE,
        }),
      }),
    );
  });

  describe("oracle 1 — the response no longer identifies anybody", () => {
    it("returns no user id for a phone that already exists", async () => {
      const response = await POST(request(inPersonBody()));
      const body = await response.text();

      expect(body).not.toContain("userId");
      expect(body).not.toContain("user-1");
    });

    it("returns no user id on the session path either", async () => {
      getCurrentSessionMock.mockResolvedValue({ user: { role: "client", phone: EXISTING_PHONE } });

      const response = await POST(request(inPersonBody()));
      const json = await response.json();

      expect(json.booking.id).toBe("pb-1");
      expect(json.booking).not.toHaveProperty("userId");
      expect(json.userId).toBeUndefined();
    });
  });

  describe("oracle 2/3 — the response cannot be made to depend on the contact", () => {
    it("answers a known phone and an unknown phone identically", async () => {
      const known = await POST(request(inPersonBody({ contactPhone: EXISTING_PHONE })));
      const knownJson = await known.json();
      const unknown = await POST(request(inPersonBody({ contactPhone: UNKNOWN_PHONE })));
      const unknownJson = await unknown.json();

      expect(known.status).toBe(unknown.status);
      expect(Object.keys(knownJson).sort()).toEqual(Object.keys(unknownJson).sort());
      expect(Object.keys(knownJson.verification).sort()).toEqual(
        Object.keys(unknownJson.verification).sort(),
      );
    });

    it("cannot produce booking_blocked for an anonymous caller", async () => {
      // Even with the clinic's block check primed to reject, the anonymous step never reaches it.
      isBookingBlockedMock.mockRejectedValue(new Error("booking_blocked"));

      const response = await POST(request(inPersonBody()));

      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain("booking_blocked");
      expect(isBookingBlockedMock).not.toHaveBeenCalled();
    });

    it("collapses every delivery and per-phone-limit failure into one code", async () => {
      // Two distinguishable causes upstream — the per-phone gate refusing (lockout or resend
      // cooldown, both facts about the NUMBER) and delivery failing — and one body downstream.
      const failures: (() => void)[] = [
        () => issueChallengeMock.mockResolvedValueOnce(false),
        () => deliverCodeMock.mockResolvedValueOnce({ ok: false }),
      ];
      for (const arrange of failures) {
        arrange();
        const response = await POST(request(inPersonBody()));
        expect(response.status).toBe(503);
        // Identical body every time — no retry countdown, which would leak that a code was
        // recently sent to that number.
        expect(await response.json()).toEqual({ ok: false, error: "verification_unavailable" });
      }
    });
  });

  describe("the session shortcut is the owner's «или вход», not a bypass", () => {
    it("creates directly when the caller's own session carries that phone", async () => {
      getCurrentSessionMock.mockResolvedValue({ user: { role: "client", phone: "8 900 123-45-67" } });

      const response = await POST(request(inPersonBody()));

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe(
        '{"ok":true,"booking":{"id":"pb-1","canonicalAppointmentId":"appt-1","status":"confirmed"}}',
      );
      expect(createBookingMock).toHaveBeenCalledTimes(1);
      expect(issueChallengeMock).not.toHaveBeenCalled();
      // Session-proved phone: trust may be stamped.
      expect(resolveUserMock).toHaveBeenCalledWith(EXISTING_PHONE, "Иван", true);
      expect(organizationSeenByFinalWrite).toBe(ORG_ID);
    });

    it("keeps booking_blocked visible only on the session-proved branch", async () => {
      getCurrentSessionMock.mockResolvedValue({ user: { role: "client", phone: EXISTING_PHONE } });
      createBookingMock.mockRejectedValueOnce(new Error("booking_blocked"));

      const response = await POST(request(inPersonBody()));

      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe('{"ok":false,"error":"booking_blocked"}');
    });

    it("still demands a code when a logged-in patient submits somebody else's phone", async () => {
      getCurrentSessionMock.mockResolvedValue({ user: { role: "client", phone: UNKNOWN_PHONE } });

      const response = await POST(request(inPersonBody({ contactPhone: EXISTING_PHONE })));

      expect(typeof (await response.json()).verification.challengeId).toBe("string");
      expect(createBookingMock).not.toHaveBeenCalled();
    });

    it("ignores a staff session — it proves nothing about a patient's phone", async () => {
      getCurrentSessionMock.mockResolvedValue({ user: { role: "doctor", phone: EXISTING_PHONE } });

      const response = await POST(request(inPersonBody()));

      expect(typeof (await response.json()).verification.challengeId).toBe("string");
      expect(createBookingMock).not.toHaveBeenCalled();
    });
  });

  it("rejects a retired branchServiceId-only payload", async () => {
    const response = await POST(request({ type: "in_person", orgSlug: "clinic-a", branchServiceId: "00000000-0000-4000-8000-000000000001", slotStart: "2026-06-01T10:00:00.000Z", slotEnd: "2026-06-01T11:00:00.000Z", contactName: "Иван", contactPhone: EXISTING_PHONE }));
    expect(response.status).toBe(400);
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValue(true);
    const response = await POST(request(inPersonBody({ contactName: "Test" })));
    expect(response.status).toBe(429);
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(issueChallengeMock).not.toHaveBeenCalled();
  });

  it("denies clinic-A confirmation carrying valid clinic-B booking ids before user creation", async () => {
    resolveOrganizationIdBySlugMock.mockResolvedValue(ORG_ID);
    resolvePublicBookingOrganizationMock.mockResolvedValue(OTHER_ORG_ID);

    const response = await POST(request(inPersonBody()));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "ambiguous_booking_tenant" });
    expect(resolveUserMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
    // and no code was sent, so the tenant check still runs BEFORE anything reaches the contact
    expect(issueChallengeMock).not.toHaveBeenCalled();
  });

  it("denies a mismatch the slug pre-check missed, caught by the second independent check", async () => {
    // `resolvePublicBookingOrganization` agrees with the slug, but the branch and service actually
    // belong to another clinic. The in-principal re-resolve is what catches it.
    getBranchMock.mockResolvedValue({ id: BRANCH_ID, organizationId: OTHER_ORG_ID, cityCode: "moscow" });
    getServiceMock.mockResolvedValue({ id: SERVICE_ID, organizationId: OTHER_ORG_ID });
    resolveCanonicalInPersonContextMock.mockResolvedValue({ organizationId: OTHER_ORG_ID, branchId: BRANCH_ID, serviceId: SERVICE_ID });

    const response = await POST(request(inPersonBody()));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "ambiguous_booking_tenant" });
    expect(issueChallengeMock).not.toHaveBeenCalled();
  });

  it("redacts an unknown public booking exception behind fixed create_failed", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { role: "client", phone: EXISTING_PHONE } });
    createBookingMock.mockRejectedValueOnce(new Error("patient@example.test SQLSTATE 23505 provider payload"));

    const response = await POST(request(inPersonBody()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "create_failed" });
  });

  it.each(["toString", "constructor", "__proto__"])(
    "treats inherited typed literal key %s as unknown create_failed",
    async (inheritedKey) => {
      resolvePublicBookingOrganizationMock.mockRejectedValueOnce(new InPersonBookingResolveError(inheritedKey));
      const response = await POST(request(inPersonBody()));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ ok: false, error: "create_failed" });
    },
  );
});
