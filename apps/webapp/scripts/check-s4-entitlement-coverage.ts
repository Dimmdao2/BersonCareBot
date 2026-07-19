import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DECLARED_NO_SURFACE, PROTECTED_ACTION_MAPPINGS, type ProtectedActionMapping } from "../src/app-layer/entitlements/protectedActionRegistry";
import { MECHANIC_REGISTRY } from "../src/modules/org-entitlements/types";

const WEBAPP_ROOT = resolve(import.meta.dirname, "..");
type Finding = Readonly<{ id: string; message: string }>;

export function validateProtectedActionMappings(
  mappings: readonly ProtectedActionMapping[],
  sourceFor: (file: string) => string,
): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const mapping of mappings) {
    if (seen.has(mapping.id)) findings.push({ id: mapping.id, message: "duplicate mapping id" });
    seen.add(mapping.id);
    const source = sourceFor(mapping.file);
    if (!new RegExp(`export\\s+async\\s+function\\s+${mapping.exportName}\\b`).test(source)) {
      findings.push({ id: mapping.id, message: `unknown exported action ${mapping.exportName}` });
    }
    const guardPattern = new RegExp(`${mapping.guard}\\([^)]*,\\s*["']${mapping.mechanic}["']`);
    if (!guardPattern.test(source)) {
      findings.push({ id: mapping.id, message: `missing ${mapping.guard}(${mapping.mechanic})` });
    }
  }
  for (const mechanic of Object.keys(MECHANIC_REGISTRY)) {
    if (!mappings.some((mapping) => mapping.mechanic === mechanic) && !(mechanic in DECLARED_NO_SURFACE)) {
      findings.push({ id: mechanic, message: "unregistered mechanic surface" });
    }
  }
  return findings;
}

function staticBypassFindings(): Finding[] {
  const files = [
    ...listTypeScriptFiles(resolve(WEBAPP_ROOT, "src/app/api")),
    ...listTypeScriptFiles(resolve(WEBAPP_ROOT, "src/app/app")),
    ...listTypeScriptFiles(resolve(WEBAPP_ROOT, "src/modules")).filter(
      (file) => !file.includes("/src/modules/org-entitlements/"),
    ),
  ].filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"));
  return files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const directResolver = /\bisMechanicEnabled\s*\(/.test(source);
    const directTariffRead = /\b(getTariffForOrg|listOverrides)\s*\(/.test(source);
    return directResolver || directTariffRead
      ? [{ id: file.replace(`${WEBAPP_ROOT}/`, ""), message: "direct entitlement resolver or tariff/override read outside boundary" }]
      : [];
  });
}

function listTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(root, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

export function runS4EntitlementCoverageCheck(): Finding[] {
  const mappingFindings = validateProtectedActionMappings(
    PROTECTED_ACTION_MAPPINGS,
    (file) => readFileSync(resolve(WEBAPP_ROOT, file), "utf8"),
  );
  return [...mappingFindings, ...staticBypassFindings()];
}

function runSelfTest(): Finding[] {
  const sample = PROTECTED_ACTION_MAPPINGS[0]!;
  const duplicate = { ...sample };
  const unknownExport = { ...sample, id: "self.unknown", exportName: "MISSING" };
  const sourceFor = () => "export async function POST() { await requireEntitlement(ctx, 'courses'); }";
  return validateProtectedActionMappings([sample, duplicate, unknownExport], sourceFor).filter(
    (finding) => finding.message === "duplicate mapping id" || finding.message.startsWith("unknown exported action"),
  );
}

if (process.argv.includes("--self-test")) {
  const findings = runSelfTest();
  if (findings.length !== 2) throw new Error(`checker self-test failed: ${JSON.stringify(findings)}`);
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
