import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(() => true),
  enterOrg: vi.fn(() => true),
  getCached: vi.fn(async () => ({ hit: false as const })),
  setCached: vi.fn(async () => true),
  run: vi.fn(async () => ({ ok: true, webPushDelivered: 1 })),
  findByIntegratorId: vi.fn(async () => ({ platformUserId: "11111111-1111-4111-8111-111111111111" })),
  hasActiveEnrollment: vi.fn(async () => true),
}));

vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({ verifyIntegratorSignature: mocks.verify }));
vi.mock("@/app-layer/principal/integratorOrganizationPrincipal", () => ({
  enterVerifiedIntegratorOrganizationPrincipal: mocks.enterOrg,
}));
vi.mock("@/app-layer/idempotency/idempotencyStore", () => ({
  isKeyValid: () => true,
  getCachedResponse: mocks.getCached,
  setCachedResponse: mocks.setCached,
}));
vi.mock("@/modules/patient-notifications/patientWebPushNotify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/patient-notifications/patientWebPushNotify")>();
  return { ...actual, runPatientWebPushNotify: mocks.run };
});
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userProjection: {
      findByIntegratorId: mocks.findByIntegratorId,
      findByPhoneNormalized: vi.fn(),
    },
    patientOrganization: { hasActiveEnrollment: mocks.hasActiveEnrollment },
    channelPreferencesPort: {}, topicChannelPrefs: {}, webPushSubscriptions: {}, systemSettings: {},
    readReminderNotifyGate: vi.fn(), notificationDelivery: {}, supportCommunication: {},
  }),
}));

import { POST } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";
function request(body: Record<string, unknown>) {
  return new Request("http://test/api/integrator/patient-notifications/web-push", {
    method: "POST",
    headers: {
      "x-bersoncare-timestamp": "1",
      "x-bersoncare-signature": "sig",
      "x-bersoncare-idempotency-key": "pwp:test",
    },
    body: JSON.stringify(body),
  });
}
const body = {
  organizationId: ORG,
  integratorUserId: "42",
  topicCode: "news",
  intentType: "news",
  openUrl: "/app/patient",
  stableKey: "pwp:test",
  broadcastTitle: "Test",
};

describe("patient web-push signed M2M organization boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing organization before idempotency DB access", async () => {
    const { organizationId: _, ...withoutOrg } = body;
    const response = await POST(request(withoutOrg));
    expect(response.status).toBe(400);
    expect(mocks.getCached).not.toHaveBeenCalled();
  });

  it("enters signed organization before idempotency and verifies enrollment", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(mocks.enterOrg).toHaveBeenCalledWith(ORG, "integrator-patient-web-push-notify");
    expect(mocks.enterOrg.mock.invocationCallOrder[0]).toBeLessThan(mocks.getCached.mock.invocationCallOrder[0]!);
    expect(mocks.hasActiveEnrollment).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", ORG);
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it("denies a resolved target outside the signed organization", async () => {
    mocks.hasActiveEnrollment.mockResolvedValueOnce(false);
    const response = await POST(request(body));
    expect(response.status).toBe(403);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
