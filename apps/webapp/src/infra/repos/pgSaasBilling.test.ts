/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));

import { createPgSaasBillingRepository } from "./pgSaasBilling";

describe("pgSaasBilling provider-event boundary", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
  });

  it("drops patient-ish fields before the provider event reaches the table", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "event-row-1" }]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    getDrizzleMock.mockReturnValue({
      insert: vi.fn(() => ({ values })),
    });

    await createPgSaasBillingRepository().recordSaasBillingProviderEvent({
      organizationId: "11111111-1111-4111-8111-111111111111",
      saasBillingInvoiceId: "22222222-2222-4222-8222-222222222222",
      event: {
        providerId: "mock",
        providerEventId: "provider-event-1",
        type: "captured",
        status: "paid",
        amountMinor: 125_000,
        currency: "RUB",
        invoiceReference: "invoice-ref-1",
        occurredAt: "2026-07-27T12:00:00.000Z",
        patientName: "must-not-persist",
        patientPhone: "must-not-persist",
      } as never,
    });

    expect(values).toHaveBeenCalledWith({
      organizationId: "11111111-1111-4111-8111-111111111111",
      saasBillingInvoiceId: "22222222-2222-4222-8222-222222222222",
      providerId: "mock",
      providerEventId: "provider-event-1",
      eventType: "captured",
      rawPayload: {
        providerId: "mock",
        providerEventId: "provider-event-1",
        type: "captured",
        status: "paid",
        amountMinor: 125_000,
        currency: "RUB",
        invoiceReference: "invoice-ref-1",
        occurredAt: "2026-07-27T12:00:00.000Z",
      },
    });
  });
});
