import {
  BC_CORRELATION_ID_HEADER,
  getCurrentCorrelationId,
  runWithDbBootstrapPrincipal,
} from "@bersoncare/db-principal";
import { describe, expect, it, vi } from "vitest";

const verifySignatureMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorSignature: verifySignatureMock,
}));

import { verifyIntegratorSignature } from "./verifyIntegratorSignature";

describe("request-aware integrator POST signature boundary", () => {
  it("adopts the bounded inbound correlation before verification", () => {
    const correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const previousCorrelationId = getCurrentCorrelationId();
    const context = runWithDbBootstrapPrincipal(
      { source: "test:integrator-post" },
      () => {
        const result = verifyIntegratorSignature(
          "1700000000",
          "{}",
          "signature",
          new Request("http://localhost/api/integrator/probe", {
            method: "POST",
            headers: { [BC_CORRELATION_ID_HEADER]: correlationId },
          }),
        );
        return { result, correlationId: getCurrentCorrelationId() };
      },
    );

    expect(context).toEqual({ result: true, correlationId });
    expect(verifySignatureMock).toHaveBeenCalledWith("1700000000", "{}", "signature");
    expect(getCurrentCorrelationId()).toBe(previousCorrelationId);
  });
});
