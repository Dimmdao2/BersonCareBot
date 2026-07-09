import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

type HandlerExpectation = {
  file: string;
  exportName: "POST" | "PATCH" | "DELETE";
  treatmentCall: string;
};

const mutatingHandlers: HandlerExpectation[] = [
  {
    file: "src/app/api/doctor/treatment-program-templates/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.createTemplate",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/[id]/route.ts",
    exportName: "PATCH",
    treatmentCall: "deps.treatmentProgram.updateTemplate",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/[id]/route.ts",
    exportName: "DELETE",
    treatmentCall: "deps.treatmentProgram.deleteTemplate",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/[id]/stages/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.createStage",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/[id]/stages/reorder/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.reorderTemplateStages",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stages/[stageId]/route.ts",
    exportName: "PATCH",
    treatmentCall: "deps.treatmentProgram.updateStage",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stages/[stageId]/route.ts",
    exportName: "DELETE",
    treatmentCall: "deps.treatmentProgram.deleteStage",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stages/[stageId]/items/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.addStageItem",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stages/[stageId]/items/reorder/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.reorderTemplateStageItems",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stage-items/[itemId]/route.ts",
    exportName: "PATCH",
    treatmentCall: "deps.treatmentProgram.updateStageItem",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stage-items/[itemId]/route.ts",
    exportName: "DELETE",
    treatmentCall: "deps.treatmentProgram.deleteStageItem",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stages/[stageId]/groups/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.createTemplateStageGroup",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stages/[stageId]/groups/reorder/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.reorderTemplateStageGroups",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stage-groups/[groupId]/route.ts",
    exportName: "PATCH",
    treatmentCall: "deps.treatmentProgram.updateTemplateStageGroup",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stage-groups/[groupId]/route.ts",
    exportName: "DELETE",
    treatmentCall: "deps.treatmentProgram.deleteTemplateStageGroup",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stages/[stageId]/items/from-test-set/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.expandTestSetIntoTemplateStageItems",
  },
  {
    file: "src/app/api/doctor/treatment-program-templates/stages/[stageId]/items/from-lfk-complex/route.ts",
    exportName: "POST",
    treatmentCall: "deps.treatmentProgram.expandLfkComplexIntoTemplateStageItems",
  },
];

const routeRoot = join(process.cwd(), "src/app/api/doctor/treatment-program-templates");
const expectedMutationKeys = new Set(mutatingHandlers.map((spec) => `${spec.file}#${spec.exportName}`));

type TextRange = { start: number; end: number };

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function routeFiles(dir = routeRoot): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...routeFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      out.push(`src/${relative(join(process.cwd(), "src"), path)}`);
    }
  }
  return out.sort();
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

function exportedFunctionBody(src: string, exportName: HandlerExpectation["exportName"]): string {
  const startToken = `export async function ${exportName}`;
  const start = src.indexOf(startToken);
  if (start < 0) return "";
  const paramsRange = findBalancedRange(src, start + startToken.length, "(", ")");
  const bodyRange = findBalancedRange(src, paramsRange.end, "{", "}");
  return src.slice(bodyRange.start, bodyRange.end);
}

function exportedMutationKeys(): string[] {
  const keys: string[] = [];
  for (const file of routeFiles()) {
    const src = readSource(file);
    for (const exportName of ["POST", "PATCH", "DELETE"] as const) {
      if (src.includes(`export async function ${exportName}`)) {
        keys.push(`${file}#${exportName}`);
      }
    }
  }
  return keys.sort();
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

describe("doctor treatment program template principal cutover", () => {
  it("tracks every mutating treatment-program-template route export", () => {
    expect(exportedMutationKeys()).toEqual([...expectedMutationKeys].sort());
  });

  it.each(mutatingHandlers)("$file $exportName uses selected workspace principal for mutation", (spec) => {
    const src = readSource(spec.file);
    const body = exportedFunctionBody(src, spec.exportName);
    expect(body).toContain("requireDoctorWorkspaceApiContext");
    expect(body).toContain("withDoctorWorkspacePrincipal");
    expect(body).toContain(spec.treatmentCall);
    const wrappers = callRanges(body, "withDoctorWorkspacePrincipal");
    expect(wrappers.length).toBeGreaterThan(0);
    const mutationCallIndex = body.indexOf(spec.treatmentCall);
    expect(rangeContains(wrappers, mutationCallIndex)).toBe(true);
  });

  it("pgTreatmentProgram template writes are principal-aware and organization-stamped", () => {
    const src = readSource("src/infra/repos/pgTreatmentProgram.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("currentWriteOrganizationId()");
    expect(src).toContain("organizationId,");
    expect(src).not.toContain("db.transaction(async");
    expect(src).not.toMatch(/await\s+db\s*\.\s*(insert|update|delete)\b/);
  });
});
