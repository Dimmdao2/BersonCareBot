import { NextResponse } from "next/server";
import type { Mock } from "vitest";

/** Signed GET headers that pass `wireDefaultAssertIntegratorGetForRouteTests` (not `"bad"`). */
export const integratorGetSignedHeadersOk = {
  "x-bersoncare-timestamp": "1700000000",
  "x-bersoncare-signature": "sig",
} as const;

/**
 * Colocated route tests: stub `assertIntegratorGetRequest` with the same status/body as production
 * for missing headers / invalid signature, without importing `@/infra/webhooks/*`.
 * Use signature value `"bad"` for the 401 branch.
 */
export function wireDefaultAssertIntegratorGetForRouteTests(
  assertMock: Mock<(request: Request) => NextResponse | null>
): void {
  assertMock.mockImplementation((request: Request) => {
    const timestamp = request.headers.get("x-bersoncare-timestamp");
    const signature = request.headers.get("x-bersoncare-signature");
    if (!timestamp || !signature) {
      return NextResponse.json({ ok: false, error: "missing webhook headers" }, { status: 400 });
    }
    if (signature === "bad") {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
    }
    return null;
  });
}
