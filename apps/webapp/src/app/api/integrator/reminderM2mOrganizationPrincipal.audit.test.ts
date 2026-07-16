import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function expectOrdered(text: string, fragments: string[]): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment);
    expect(next, `missing ${fragment}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

describe("integrator reminder M2M organization principal ordering", () => {
  it("verifies each GET signature before installing the organization and touching DI", () => {
    for (const path of ["./reminders/rules/route.ts", "./delivery-targets/route.ts"]) {
      expectOrdered(source(path), [
        "assertIntegratorGetRequest(request)",
        "enterVerifiedIntegratorOrganizationPrincipal(",
        "buildAppDeps()",
      ]);
    }
  });

  it("verifies and validates notify payload before principal, enrollment, and idempotency DB access", () => {
    expectOrdered(source("./patient-reminders/notify-channels/route.ts"), [
      "verifyIntegratorSignature(timestamp, rawBody, signature)",
      "integratorPatientReminderNotifyBodySchema.safeParse(parsedJson)",
      "enterVerifiedIntegratorOrganizationPrincipal(",
      "hasActiveEnrollment(",
      "getCachedResponse(idempotencyKey, requestHash)",
    ]);
  });
});
