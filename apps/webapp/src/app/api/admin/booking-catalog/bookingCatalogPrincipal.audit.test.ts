import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mutatingRouteFiles = [
  "src/app/api/admin/booking-catalog/cities/route.ts",
  "src/app/api/admin/booking-catalog/cities/[id]/route.ts",
  "src/app/api/admin/booking-catalog/branches/route.ts",
  "src/app/api/admin/booking-catalog/branches/[id]/route.ts",
  "src/app/api/admin/booking-catalog/services/route.ts",
  "src/app/api/admin/booking-catalog/services/[id]/route.ts",
  "src/app/api/admin/booking-catalog/specialists/route.ts",
  "src/app/api/admin/booking-catalog/specialists/[id]/route.ts",
  "src/app/api/admin/booking-catalog/branch-services/route.ts",
  "src/app/api/admin/booking-catalog/branch-services/[id]/route.ts",
] as const;

const routeMutationSpecs = [
  { file: "src/app/api/admin/booking-catalog/cities/route.ts", exports: ["POST"] },
  { file: "src/app/api/admin/booking-catalog/cities/[id]/route.ts", exports: ["PATCH", "DELETE"] },
  { file: "src/app/api/admin/booking-catalog/branches/route.ts", exports: ["POST"] },
  { file: "src/app/api/admin/booking-catalog/branches/[id]/route.ts", exports: ["PATCH", "DELETE"] },
  { file: "src/app/api/admin/booking-catalog/services/route.ts", exports: ["POST"] },
  { file: "src/app/api/admin/booking-catalog/services/[id]/route.ts", exports: ["PATCH", "DELETE"] },
  { file: "src/app/api/admin/booking-catalog/specialists/route.ts", exports: ["POST"] },
  { file: "src/app/api/admin/booking-catalog/specialists/[id]/route.ts", exports: ["PATCH", "DELETE"] },
  { file: "src/app/api/admin/booking-catalog/branch-services/route.ts", exports: ["POST"] },
  { file: "src/app/api/admin/booking-catalog/branch-services/[id]/route.ts", exports: ["PATCH", "DELETE"] },
] as const;

const rubitimeMappingRouteFiles = [
  "src/app/api/admin/booking-engine/rubitime-mapping/route.ts",
  "src/app/api/admin/booking-engine/rubitime-mapping/link/route.ts",
  "src/app/api/admin/booking-engine/rubitime-mapping/duplicates/route.ts",
] as const;

const catalogWriteMethods = [
  "upsertCity",
  "upsertBranch",
  "upsertSpecialist",
  "upsertService",
  "upsertBranchService",
  "updateCityById",
  "deactivateCity",
  "updateBranchById",
  "deactivateBranch",
  "updateServiceById",
  "deactivateService",
  "updateSpecialistById",
  "deactivateSpecialist",
  "upsertBranchServiceAdmin",
  "deactivateBranchService",
] as const;

type TextRange = { start: number; end: number };

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function findBalancedRange(src: string, start: number, openChar: "{" | "(", closeChar: "}" | ")"): TextRange {
  const open = src.indexOf(openChar, start);
  expect(open).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === openChar) depth += 1;
    if (ch === closeChar) depth -= 1;
    if (depth === 0) return { start: open, end: i + 1 };
  }
  throw new Error(`Unbalanced ${openChar}${closeChar} from ${start}`);
}

function exportedFunctionBody(src: string, name: string): string {
  const marker = `export async function ${name}`;
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const paramsRange = findBalancedRange(src, start + marker.length, "(", ")");
  const range = findBalancedRange(src, paramsRange.end, "{", "}");
  return src.slice(range.start, range.end);
}

function objectMethodBody(src: string, name: string): string {
  const marker = `async ${name}`;
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const paramsRange = findBalancedRange(src, start + marker.length, "(", ")");
  const range = findBalancedRange(src, paramsRange.end, "{", "}");
  return src.slice(range.start, range.end);
}

function callRanges(src: string, callee: string): TextRange[] {
  const ranges: TextRange[] = [];
  let cursor = 0;
  while (cursor < src.length) {
    const start = src.indexOf(callee, cursor);
    if (start === -1) break;
    ranges.push(findBalancedRange(src, start + callee.length, "(", ")"));
    cursor = start + callee.length;
  }
  return ranges;
}

function rangeContains(ranges: TextRange[], index: number): boolean {
  return ranges.some((range) => range.start <= index && index < range.end);
}

function allMatchIndexes(src: string, pattern: RegExp): number[] {
  const indexes: number[] = [];
  for (const match of src.matchAll(pattern)) {
    if (match.index !== undefined) indexes.push(match.index);
  }
  return indexes;
}

describe("admin booking catalog workspace principal cutover", () => {
  it("keeps global catalog governance closed until U9 has a platform DB principal", () => {
    const src = readSource("src/app/api/admin/booking-catalog/_requireAdminBookingCatalog.ts");
    expect(src).not.toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("U9 owns true global catalog governance");
    expect(src).toContain('error: "forbidden"');
    expect(src).toContain("organizationId: string");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it.each(mutatingRouteFiles)("%s wraps write paths in admin booking catalog principal", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireAdminBookingCatalog");
    expect(src).toContain("withAdminBookingCatalogPrincipal");
  });

  it.each(routeMutationSpecs)("$file has no unwrapped mutating port calls", ({ file, exports }) => {
    const src = readSource(file);
    for (const exportName of exports) {
      const body = exportedFunctionBody(src, exportName);
      const wrappers = callRanges(body, "withAdminBookingCatalogPrincipal");
      expect(wrappers.length).toBeGreaterThan(0);
      const mutationCallIndexes = allMatchIndexes(
        body,
        /gate\.ctx\.port\.(?:upsert[A-Za-z0-9_]*|update[A-Za-z0-9_]*|deactivate[A-Za-z0-9_]*)/g,
      );
      expect(mutationCallIndexes.length).toBeGreaterThan(0);
      for (const callIndex of mutationCallIndexes) {
        expect(rangeContains(wrappers, callIndex)).toBe(true);
      }
    }
  });

  it("keeps legacy catalog writes transaction-backed with side-effect syncs on the same executor", () => {
    const src = readSource("src/infra/repos/pgBookingCatalog.ts");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("runCatalogMutation");
    expect(src).toContain("syncBranchesTimezoneFromCatalog(");
    expect(src).toContain("syncCanonicalServiceFromCatalog(");
    expect(src).toMatch(/runWebappPgText\([\s\S]*db,\s*\);/);
  });

  it.each(catalogWriteMethods)("%s runs direct SQL writes through tx-backed catalog mutation", (methodName) => {
    const src = readSource("src/infra/repos/pgBookingCatalog.ts");
    const body = objectMethodBody(src, methodName);
    expect(body).toContain("return runCatalogMutation(async (tx) => {");
    const queryCallRanges = callRanges(body, "runWebappPgText");
    expect(queryCallRanges.length).toBeGreaterThan(0);
    for (const range of queryCallRanges) {
      expect(body.slice(range.start, range.end)).toMatch(/,\s*tx,\s*\)$/);
    }
  });

  it("passes the active tx into catalog side-effect syncs", () => {
    const src = readSource("src/infra/repos/pgBookingCatalog.ts");
    expect(objectMethodBody(src, "upsertBranch")).toContain(
      "await syncBranchesTimezoneFromCatalog(rubitimeBranchId, tz, tx);",
    );
    expect(objectMethodBody(src, "updateBranchById")).toContain(
      "await syncBranchesTimezoneFromCatalog(row.rubitime_branch_id, row.timezone, tx);",
    );
    expect(objectMethodBody(src, "upsertService")).toContain("}, tx);");
    expect(objectMethodBody(src, "updateServiceById")).toContain("}, tx);");
  });

  it.each(rubitimeMappingRouteFiles)("%s already goes through booking-engine workspace gate", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireAdminBookingEngine");
    expect(src).toContain("organizationId: gate.ctx.organizationId");
  });
});
