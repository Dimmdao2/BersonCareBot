import { describe, expect, it } from "vitest";
import { runS4EntitlementCoverageCheck, validateProtectedActionMappings } from "./check-s4-entitlement-coverage";
import { PROTECTED_ACTION_MAPPINGS } from "../src/app-layer/entitlements/protectedActionRegistry";

describe("S4 entitlement coverage checker", () => {
  it("maps every known protected action exactly once without a bypass", () => {
    expect(runS4EntitlementCoverageCheck()).toEqual([]);
  });

  it("rejects an unregistered exported action and a double mapping", () => {
    const source = "export async function POST() { await requireEntitlement(ctx, 'courses'); }";
    const findings = validateProtectedActionMappings(
      [PROTECTED_ACTION_MAPPINGS[0]!, PROTECTED_ACTION_MAPPINGS[0]!, { ...PROTECTED_ACTION_MAPPINGS[0]!, id: "unknown", exportName: "PUT" }],
      () => source,
    );
    expect(findings.map((finding) => finding.message)).toEqual(expect.arrayContaining(["duplicate mapping id", "unknown exported action PUT"]));
  });
});
