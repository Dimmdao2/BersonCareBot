import { describe, expect, it } from "vitest";
import { createEmptyInstanceEditorDraft } from "./instanceEditorDraft";
import { serializeInstanceEditorBatchDraftForApi } from "./serializeInstanceEditorBatchDraftForApi";
import { instanceEditorBatchDraftSchema } from "@/modules/treatment-program/instanceEditorBatchSchema";

describe("serializeInstanceEditorBatchDraftForApi", () => {
  it("strips catalog snapshots from itemCreates and structural replace", () => {
    const draft = createEmptyInstanceEditorDraft();
    draft.itemCreates.push({
      kind: "library_item",
      clientId: "draft:11111111-1111-4111-8111-111111111111",
      stageId: "22222222-2222-4222-8222-222222222222",
      itemType: "exercise",
      itemRefId: "33333333-3333-4333-8333-333333333333",
      snapshot: {
        media: [{ mediaUrl: "/api/media/x/preview/sm", mediaType: "image" }],
      },
    });
    draft.itemCreates.push({
      kind: "lfk_complex_expand",
      stageId: "22222222-2222-4222-8222-222222222222",
      groupId: "44444444-4444-4444-8444-444444444444",
      complexTemplateId: "55555555-5555-4555-8555-555555555555",
      items: [
        {
          clientId: "draft:66666666-6666-4666-8666-666666666666",
          itemRefId: "77777777-7777-4777-8777-777777777777",
          snapshot: { title: "Упр", media: [{ mediaUrl: "/preview/sm" }] },
        },
      ],
    });
    draft.itemStructuralPatches["88888888-8888-4888-8888-888888888888"] = {
      replace: {
        itemType: "exercise",
        itemRefId: "99999999-9999-4999-8999-999999999999",
        snapshot: { media: [{ mediaUrl: "/api/media/y/preview/sm" }] },
      },
    };

    const wire = serializeInstanceEditorBatchDraftForApi(draft);

    expect(wire.itemCreates[0]).not.toHaveProperty("snapshot");
    const expand = wire.itemCreates[1];
    expect(expand?.kind).toBe("lfk_complex_expand");
    if (expand?.kind === "lfk_complex_expand") {
      expect(expand.items[0]).not.toHaveProperty("snapshot");
    }
    expect(wire.itemStructuralPatches["88888888-8888-4888-8888-888888888888"]?.replace).toEqual({
      itemType: "exercise",
      itemRefId: "99999999-9999-4999-8999-999999999999",
    });
    expect(instanceEditorBatchDraftSchema.safeParse(wire).success).toBe(true);
    expect(JSON.stringify(wire)).not.toContain("preview/sm");
  });
});
