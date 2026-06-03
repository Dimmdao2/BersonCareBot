import { describe, expect, it } from "vitest";
import {
  instanceEditorBatchBodySchema,
  instanceEditorBatchDraftSchema,
  isInstanceEditorBatchDraftEmpty,
  isProgramChangedDiffEmpty,
  createEmptyProgramChangedDiff,
} from "./instanceEditorBatchSchema";

const emptyDraft = {
  stageMetadata: {},
  groupPatches: {},
  itemPatches: {},
  stageOrder: null,
  stageCreates: [],
  groupCreates: [],
  itemCreates: [],
  itemDeletes: {},
  itemReorders: {},
  groupReorders: {},
  groupHides: {},
  itemStructuralPatches: {},
};

describe("instanceEditorBatchSchema", () => {
  it("parses minimal empty draft body", () => {
    const parsed = instanceEditorBatchBodySchema.parse({ draft: {} });
    expect(parsed.draft.stageCreates).toEqual([]);
    expect(isInstanceEditorBatchDraftEmpty(parsed.draft)).toBe(true);
  });

  it("accepts draft client id and uuid refs", () => {
    const stageId = "22222222-2222-4222-8222-222222222222";
    const clientId = "draft:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const parsed = instanceEditorBatchDraftSchema.parse({
      ...emptyDraft,
      stageCreates: [{ clientId, title: "Новый этап" }],
      stageMetadata: { [stageId]: { title: "Этап" } },
    });
    expect(parsed.stageCreates[0]?.clientId).toBe(clientId);
  });

  it("rejects unknown body keys", () => {
    expect(() => instanceEditorBatchBodySchema.parse({ draft: emptyDraft, extra: true })).toThrow();
  });

  it("rejects invalid draft client id", () => {
    expect(() =>
      instanceEditorBatchDraftSchema.parse({
        ...emptyDraft,
        stageCreates: [{ clientId: "not-a-draft-id", title: "X" }],
      }),
    ).toThrow();
  });

  it("tracks empty program_changed diff", () => {
    expect(isProgramChangedDiffEmpty(createEmptyProgramChangedDiff())).toBe(true);
    expect(
      isProgramChangedDiffEmpty({
        ...createEmptyProgramChangedDiff(),
        itemsMetadataUpdated: 1,
      }),
    ).toBe(false);
  });
});
