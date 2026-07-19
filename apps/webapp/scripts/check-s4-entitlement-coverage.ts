import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DECLARED_NO_SURFACE,
  PROTECTED_ACTION_EXEMPTIONS,
  PROTECTED_ACTION_MAPPINGS,
  type ProtectedActionExemption,
  type ProtectedActionMapping,
} from "../src/app-layer/entitlements/protectedActionRegistry";
import { MECHANIC_REGISTRY, type OrgMechanic } from "../src/modules/org-entitlements/types";

const WEBAPP_ROOT = resolve(import.meta.dirname, "..");
type Finding = Readonly<{ id: string; message: string }>;
type SourceFor = (file: string) => string;
type SourceFile = Readonly<{ file: string; source: string }>;

function actionKey(file: string, exportName: string) {
  return `${file}:${exportName}`;
}

export function exportedActionNames(source: string): string[] {
  return [...source.matchAll(/export\s+async\s+function\s+([A-Za-z_$][\w$]*)\b/g)].map((match) => match[1]!);
}

function exportedActionSource(source: string, exportName: string): string | null {
  const start = source.search(new RegExp(`export\\s+async\\s+function\\s+${exportName}\\b`));
  if (start < 0) return null;
  const next = source.slice(start + 1).search(/\nexport\s+async\s+function\s+/);
  return next < 0 ? source.slice(start) : source.slice(start, start + next + 1);
}

export function validateProtectedActionMappings(
  mappings: readonly ProtectedActionMapping[],
  sourceFor: SourceFor,
  mechanics: readonly OrgMechanic[] = Object.keys(MECHANIC_REGISTRY) as OrgMechanic[],
  declaredNoSurface: Readonly<Record<string, string>> = DECLARED_NO_SURFACE,
): Finding[] {
  const findings: Finding[] = [];
  const seenIds = new Set<string>();
  const mappingCountByAction = new Map<string, number>();
  for (const mapping of mappings) {
    if (seenIds.has(mapping.id)) findings.push({ id: mapping.id, message: "duplicate mapping id" });
    seenIds.add(mapping.id);
    const key = actionKey(mapping.file, mapping.exportName);
    mappingCountByAction.set(key, (mappingCountByAction.get(key) ?? 0) + 1);
    const actionSource = exportedActionSource(sourceFor(mapping.file), mapping.exportName);
    if (!actionSource) {
      findings.push({ id: mapping.id, message: `unknown exported action ${mapping.exportName}` });
      continue;
    }
    const guardPattern = new RegExp(`${mapping.guard}\\([^)]*,\\s*["']${mapping.mechanic}["']`);
    if (!guardPattern.test(actionSource)) {
      findings.push({ id: mapping.id, message: `missing ${mapping.guard}(${mapping.mechanic})` });
    }
  }
  for (const [key, count] of mappingCountByAction) {
    if (count > 1) findings.push({ id: key, message: "duplicate mapping for file/export" });
  }
  for (const mechanic of mechanics) {
    if (!mappings.some((mapping) => mapping.mechanic === mechanic) && !(mechanic in declaredNoSurface)) {
      findings.push({ id: mechanic, message: "unregistered mechanic surface" });
    }
  }
  return findings;
}

export function validateMechanicBearingExports(
  mappings: readonly ProtectedActionMapping[],
  exemptions: readonly ProtectedActionExemption[],
  sourceFor: SourceFor,
): Finding[] {
  const findings: Finding[] = [];
  const files = new Set([...mappings.map((mapping) => mapping.file), ...exemptions.map((exemption) => exemption.file)]);
  for (const file of files) {
    const mapped = new Set(mappings.filter((mapping) => mapping.file === file).map((mapping) => mapping.exportName));
    const exempt = new Set(exemptions.filter((exemption) => exemption.file === file).map((exemption) => exemption.exportName));
    for (const exportName of exportedActionNames(sourceFor(file))) {
      const isMapped = mapped.has(exportName);
      const isExempt = exempt.has(exportName);
      if (!isMapped && !isExempt) {
        findings.push({ id: actionKey(file, exportName), message: "unregistered exported action in mechanic-bearing file" });
      }
      if (isMapped && isExempt) {
        findings.push({ id: actionKey(file, exportName), message: "mapping and exemption both declared for file/export" });
      }
    }
  }
  return findings;
}

const APPROVED_BYPASS_BOUNDARY_FILES = new Set([
  "src/app-layer/guards/requireEntitlement.ts",
  "src/modules/org-entitlements/service.ts",
  "src/modules/org-entitlements/ports.ts",
]);
const DIRECT_BYPASS_PATTERN = /\b(?:assertMechanicEnabled|isMechanicEnabled|resolveOrgEntitlements|getTariffForOrg|listOverrides)\s*\(/;

export function staticBypassFindings(files: readonly SourceFile[]): Finding[] {
  return files.flatMap(({ file, source }) =>
    APPROVED_BYPASS_BOUNDARY_FILES.has(file) || !DIRECT_BYPASS_PATTERN.test(source)
      ? []
      : [{ id: file, message: "direct entitlement resolver or tariff/override read outside approved boundary" }],
  );
}

function productionBypassFiles(): SourceFile[] {
  return [
    ...listTypeScriptFiles(resolve(WEBAPP_ROOT, "src/app/api")),
    ...listTypeScriptFiles(resolve(WEBAPP_ROOT, "src/app/app")),
    ...listTypeScriptFiles(resolve(WEBAPP_ROOT, "src/app-layer")),
    ...listTypeScriptFiles(resolve(WEBAPP_ROOT, "src/modules")),
  ]
    .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
    .map((file) => ({ file: file.replace(`${WEBAPP_ROOT}/`, ""), source: readFileSync(file, "utf8") }));
}

function listTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(root, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

export function runS4EntitlementCoverageCheck(): Finding[] {
  const sourceFor = (file: string) => readFileSync(resolve(WEBAPP_ROOT, file), "utf8");
  return [
    ...validateProtectedActionMappings(PROTECTED_ACTION_MAPPINGS, sourceFor),
    ...validateMechanicBearingExports(PROTECTED_ACTION_MAPPINGS, PROTECTED_ACTION_EXEMPTIONS, sourceFor),
    ...staticBypassFindings(productionBypassFiles()),
  ];
}

export function runSelfTest(): Finding[] {
  const sample = PROTECTED_ACTION_MAPPINGS[0]!;
  const duplicate = { ...sample };
  const unknownExport = { ...sample, id: "self.unknown", exportName: "MISSING" };
  const sourceFor = () => "export async function POST() { await requireEntitlement(ctx, 'courses'); }";
  const missingMechanic = validateProtectedActionMappings([sample], sourceFor, ["courses", "mailings"], {});
  const omittedExport = validateMechanicBearingExports(
    [sample],
    [],
    () => "export async function POST() {}\nexport async function PUT() {}",
  );
  return [
    ...validateProtectedActionMappings([sample, duplicate, unknownExport], sourceFor),
    ...missingMechanic,
    ...omittedExport,
    ...staticBypassFindings([
      { file: "src/app/api/example/route.ts", source: "await assertMechanicEnabled('org', 'courses')" },
      { file: "src/app-layer/guards/requireEntitlement.ts", source: "await assertMechanicEnabled('org', 'courses')" },
    ]),
  ];
}

if (process.argv.includes("--self-test")) {
  const findings = runSelfTest();
  const requiredMessages = [
    "duplicate mapping id",
    "unknown exported action MISSING",
    "duplicate mapping for file/export",
    "unregistered mechanic surface",
    "unregistered exported action in mechanic-bearing file",
    "direct entitlement resolver or tariff/override read outside approved boundary",
  ];
  if (!requiredMessages.every((message) => findings.some((finding) => finding.message === message))) {
    throw new Error(`checker self-test failed: ${JSON.stringify(findings)}`);
  }
  console.log("S4 entitlement coverage checker self-test passed");
} else {
  const findings = runS4EntitlementCoverageCheck();
  if (findings.length > 0) {
    for (const finding of findings) console.error(`${finding.id}: ${finding.message}`);
    process.exitCode = 1;
  } else {
    console.log(`S4 entitlement coverage passed: ${PROTECTED_ACTION_MAPPINGS.length} protected actions mapped`);
  }
}
