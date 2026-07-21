import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgPaymentsPort } from "./pgPayments";

describe("pgPayments bootstrap webhook authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses only the narrow database resolver and returns its organization projection", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ organization_id: "10000000-0000-4000-8000-000000000001" }],
    });
    const port = createPgPaymentsPort();

    await expect(
      port.resolveProviderWebhookOrganization("mock", "event-key", "payment.succeeded"),
    ).resolves.toBe("10000000-0000-4000-8000-000000000001");

    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining("app.resolve_payment_webhook_organization"),
      ["mock", "event-key", "payment.succeeded"],
    );
  });

  it("preserves the resolver's fail-closed null", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ organization_id: null }] });
    const port = createPgPaymentsPort();

    await expect(
      port.resolveProviderWebhookOrganization("mock", "unknown", "payment.succeeded"),
    ).resolves.toBeNull();
  });
});
