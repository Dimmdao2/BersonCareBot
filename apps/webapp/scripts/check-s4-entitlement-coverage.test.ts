import { describe, expect, it } from "vitest";
import {
  runS4EntitlementCoverageCheck,
  runSelfTest,
  staticBypassFindings,
  validateMechanicBearingExports,
  validateProtectedActionMappings,
} from "./check-s4-entitlement-coverage";
import {
  PROTECTED_ACTION_EXEMPTIONS,
  PROTECTED_ACTION_MAPPINGS,
} from "../src/app-layer/entitlements/protectedActionRegistry";

describe("S4 entitlement coverage checker", () => {
  it("maps every known protected action exactly once without a bypass", () => {
    expect(runS4EntitlementCoverageCheck()).toEqual([]);
  });

  it("rejects unknown exports and duplicate file/export mappings", () => {
    const source = "export async function POST() { await requireEntitlement(ctx, 'courses'); }";
    const findings = validateProtectedActionMappings(
      [PROTECTED_ACTION_MAPPINGS[0]!, PROTECTED_ACTION_MAPPINGS[0]!, { ...PROTECTED_ACTION_MAPPINGS[0]!, id: "unknown", exportName: "PUT" }],
      () => source,
    );
    expect(findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining(["duplicate mapping id", "duplicate mapping for file/export", "unknown exported action PUT"]),
    );
  });

  it("rejects an omitted export and a mechanic without mapping or explicit no-surface declaration", () => {
    const omitted = validateMechanicBearingExports(
      [PROTECTED_ACTION_MAPPINGS[0]!],
      [],
      () => "export async function POST() {}\nexport async function PUT() {}",
    );
    const unregisteredMechanic = validateProtectedActionMappings(
      [PROTECTED_ACTION_MAPPINGS[0]!],
      () => "export async function POST() { await requireEntitlement(ctx, 'courses'); }",
      ["courses", "mailings"],
      {},
    );
    expect(omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "unregistered exported action in mechanic-bearing file" }),
      ]),
    );
    expect(unregisteredMechanic).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "mailings", message: "unregistered mechanic surface" })]),
    );
  });

  it("rejects direct resolver and tariff bypass outside the approved boundary", () => {
    expect(
      staticBypassFindings([
        { file: "src/app/api/example/route.ts", source: "await getTariffForOrg('org')" },
        { file: "src/app-layer/guards/requireEntitlement.ts", source: "await assertMechanicEnabled('org', 'courses')" },
      ]),
    ).toEqual([
      expect.objectContaining({ id: "src/app/api/example/route.ts" }),
    ]);
  });

  it("self-test covers checker branches", () => {
    expect(runSelfTest().map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        "unregistered mechanic surface",
        "unregistered exported action in mechanic-bearing file",
        "direct entitlement resolver or tariff/override read outside approved boundary",
      ]),
    );
    expect(PROTECTED_ACTION_EXEMPTIONS.length).toBeGreaterThan(0);
  });
});
