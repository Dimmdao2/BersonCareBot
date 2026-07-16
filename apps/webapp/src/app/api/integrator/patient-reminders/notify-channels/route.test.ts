import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";

const verifyMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorSignature: verifyMock,
}));

const getCachedMock = vi.hoisted(() => vi.fn());
const setCachedMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/idempotency/idempotencyStore", () => ({
  isKeyValid: () => true,
  getCachedResponse: getCachedMock,
  setCachedResponse: setCachedMock,
}));

const findPlatformUserMock = vi.hoisted(() => vi.fn());
const hasActiveEnrollmentMock = vi.hoisted(() => vi.fn());
const buildDepsMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildDepsMock }));

import { POST } from "./route";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/integrator/patient-reminders/notify-channels", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bersoncare-timestamp": "1700000000",
      "x-bersoncare-signature": "valid",
      "x-bersoncare-idempotency-key": "prn:occ-1:channels",
    },
    body: JSON.stringify(body),
  });
}

function validBody(): Record<string, unknown> {
  return {
    organizationId: ORGANIZATION_ID,
    integratorUserId: "42",
    occurrenceId: "occ-1",
    topicCode: "training_reminders",
    title: "Reminder",
    bodyText: "Body",
    openUrl: "https://example.test/open",
  };
}

describe("POST /api/integrator/patient-reminders/notify-channels tenant context", () => {
  beforeEach(() => {
    verifyMock.mockClear();
    getCachedMock.mockReset();
    setCachedMock.mockReset();
    findPlatformUserMock.mockReset().mockResolvedValue(null);
    hasActiveEnrollmentMock.mockReset().mockResolvedValue(true);
    buildDepsMock.mockReset().mockReturnValue({
      userProjection: { findByIntegratorId: findPlatformUserMock },
      patientOrganization: { hasActiveEnrollment: hasActiveEnrollmentMock },
    });
  });

  it("rejects missing organization before DI or idempotency DB access", async () => {
    const { organizationId: _organizationId, ...withoutOrganization } = validBody();
    const response = await POST(request(withoutOrganization));
    expect(response.status).toBe(400);
    expect(buildDepsMock).not.toHaveBeenCalled();
    expect(getCachedMock).not.toHaveBeenCalled();
  });

  it("rejects enrollment mismatch before idempotency DB access", async () => {
    findPlatformUserMock.mockResolvedValue({ platformUserId: "22222222-2222-4222-8222-222222222222" });
    hasActiveEnrollmentMock.mockResolvedValue(false);
    const response = await POST(request(validBody()));
    expect(response.status).toBe(403);
    expect(getCachedMock).not.toHaveBeenCalled();
  });

  it("runs idempotency access under the signed organization principal", async () => {
    getCachedMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipal()).toMatchObject({
        kind: "organization",
        organizationId: ORGANIZATION_ID,
      });
      return { hit: true, status: 200, body: { ok: true, cached: true } };
    });
    const response = await POST(request(validBody()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, cached: true });
  });
});
