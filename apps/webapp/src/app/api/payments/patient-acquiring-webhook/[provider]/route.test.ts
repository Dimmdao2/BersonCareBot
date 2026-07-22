import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const getPaymentProviderAdapterMock = vi.hoisted(() => vi.fn());
const runWithDbOrganizationPrincipalMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock("@/app-layer/principal/bootstrapPrincipal", () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock("@/infra/payments/paymentProviderRegistry", () => ({
  getPaymentProviderAdapter: getPaymentProviderAdapterMock,
}));
vi.mock("@bersoncare/db-principal", () => ({
  runWithDbOrganizationPrincipal: (...args: unknown[]) =>
    runWithDbOrganizationPrincipalMock(...args),
}));

import { POST } from "./route";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const PROVIDER_CONFIG = {
  id: "mock",
  label: "Mock",
  enabled: true,
  webhookSecret: "synthetic-secret",
};

function request(): Request {
  return new Request("http://test.invalid/api/payments/patient-acquiring-webhook/mock", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mock-signature": "synthetic" },
    body: JSON.stringify({ event: "payment.succeeded" }),
  });
}

function context(provider = "mock") {
  return { params: Promise.resolve({ provider }) };
}

describe("patient acquiring webhook response contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runWithDbOrganizationPrincipalMock.mockImplementation(
      async (_organizationId: string, callback: () => Promise<unknown>) => callback(),
    );
    buildAppDepsMock.mockReturnValue({
      payments: { getSettings: vi.fn().mockResolvedValue({ providers: [PROVIDER_CONFIG] }) },
      patientPayments: {
        resolveOrganizationIdByProviderPaymentId: vi.fn().mockResolvedValue(ORGANIZATION_ID),
        handleAcquiringWebhookEvent: vi.fn().mockResolvedValue({ ok: true, alreadyProcessed: false }),
      },
    });
    getPaymentProviderAdapterMock.mockReturnValue({
      verifyWebhook: vi.fn().mockReturnValue({
        eventType: "payment.succeeded",
        intentRef: "provider-payment-1",
        payload: {},
      }),
    });
  });

  it("keeps the successful exact-organization acknowledgement", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, alreadyProcessed: false });
    expect(runWithDbOrganizationPrincipalMock).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      expect.any(Function),
    );
  });

  it("masks a request-derived provider id behind payment_provider_unavailable", async () => {
    const response = await POST(request(), context("patient@example.test"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "payment_provider_unavailable",
    });
    expect(getPaymentProviderAdapterMock).not.toHaveBeenCalled();
  });

  it("preserves invalid signature masking", async () => {
    getPaymentProviderAdapterMock.mockReturnValueOnce({
      verifyWebhook: vi.fn(() => {
        throw new Error("invalid_webhook_signature");
      }),
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "invalid_webhook_signature",
    });
  });

  it("redacts unknown verification errors behind fixed webhook_verification_failed", async () => {
    getPaymentProviderAdapterMock.mockReturnValueOnce({
      verifyWebhook: vi.fn(() => {
        throw new Error("patient@example.test SQLSTATE 23505 provider payload");
      }),
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "webhook_verification_failed",
    });
  });
});
