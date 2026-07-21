import {
  BC_CORRELATION_ID_HEADER,
  getCurrentCorrelationId,
  runWithDbBootstrapPrincipal,
} from "@bersoncare/db-principal";
import { describe, expect, it } from "vitest";
import { stampBootstrapPrincipal } from "./bootstrapPrincipal";

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/probe", { headers });
}

describe("stampBootstrapPrincipal request correlation", () => {
  it("adopts only the bounded standard header and ignores the raw legacy header", () => {
    const standard = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const adopted = runWithDbBootstrapPrincipal(
      { source: "test:request" },
      () => {
        const value = stampBootstrapPrincipal(
          "test:request",
          requestWithHeaders({
            [BC_CORRELATION_ID_HEADER]: standard,
            "x-bc-auth-correlation-id": "patient-name-or-token",
          }),
        );
        expect(getCurrentCorrelationId()).toBe(standard);
        return value;
      },
    );
    expect(adopted).toBe(standard);
    expect(getCurrentCorrelationId()).toBeUndefined();
  });

  it.each([
    { label: "forged", input: "patient-name-or-token" },
    { label: "oversized", input: "x".repeat(10_000) },
  ])("replaces $label standard input", ({ input }) => {
    const adopted = runWithDbBootstrapPrincipal({ source: "test:invalid" }, () =>
      stampBootstrapPrincipal(
        "test:invalid",
        requestWithHeaders({ [BC_CORRELATION_ID_HEADER]: input }),
      ),
    );
    expect(adopted).toMatch(/^[0-9a-f-]{36}$/);
    expect(adopted).not.toBe(input);
  });

  it("keeps parallel request cells isolated and leaves no context behind", async () => {
    let ready = 0;
    const run = (correlationId: string) =>
      runWithDbBootstrapPrincipal({ source: "test:parallel" }, async () => {
        stampBootstrapPrincipal(
          "test:parallel",
          requestWithHeaders({ [BC_CORRELATION_ID_HEADER]: correlationId }),
        );
        ready += 1;
        while (ready < 2) await new Promise((resolve) => setImmediate(resolve));
        await Promise.resolve();
        return getCurrentCorrelationId();
      });

    const left = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const right = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await expect(Promise.all([run(left), run(right)])).resolves.toEqual([left, right]);
    expect(getCurrentCorrelationId()).toBeUndefined();
  });
});
