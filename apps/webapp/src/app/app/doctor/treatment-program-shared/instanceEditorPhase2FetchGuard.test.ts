import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** Immediate editor-mutation API paths forbidden after phase 2 (status/test/note flows stay on fetch). */
const FORBIDDEN_EDITOR_FETCH_SNIPPETS = [
  "stage-items/",
  "stage-groups/",
  "from-test-set",
  "from-lfk-complex",
  "from-freeform-recommendation",
  "groups/reorder",
  "stages/reorder",
] as const;

function readModule(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8");
}

function assertNoForbiddenEditorFetch(label: string, source: string) {
  for (const snippet of FORBIDDEN_EDITOR_FETCH_SNIPPETS) {
    expect(source.includes(snippet), `${label} must not fetch ${snippet}`).toBe(false);
  }
}

describe("instance editor phase 2 — no immediate editor mutation fetch", () => {
  it("TreatmentProgramInstanceDetailClient", () => {
    const source = readModule(
      "../clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx",
    );
    assertNoForbiddenEditorFetch("TreatmentProgramInstanceDetailClient", source);
  });

  it("InstanceAddLibraryItemDialog", () => {
    const source = readModule("./InstanceAddLibraryItemDialog.tsx");
    expect(source.includes("fetch(")).toBe(false);
    expect(source.includes("addItemCreate")).toBe(true);
  });
});

describe("instance editor phase 3 — flush uses editor-batch only", () => {
  it("flushInstanceEditorDraft posts editor-batch, not legacy patch paths", () => {
    const source = readModule("./flushInstanceEditorDraft.ts");
    expect(source).toContain("/editor-batch");
    assertNoForbiddenEditorFetch("flushInstanceEditorDraft", source);
  });
});
