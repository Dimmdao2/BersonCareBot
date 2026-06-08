import { describe, expect, it } from "vitest";
import {
  catalogMediaArrayHasPreviewOnlyUrls,
  EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE,
  exerciseInstanceSnapshotNeedsCatalogRebuild,
  instanceStageItemSnapshotNeedsCatalogRebuild,
} from "./editorDraftSnapshotDetect";

describe("editorDraftSnapshotDetect", () => {
  it("flags exercise draft preview snapshot", () => {
    expect(
      exerciseInstanceSnapshotNeedsCatalogRebuild({
        title: "Упр",
        media: [{ mediaUrl: "/api/media/7e07b4a9-51b9-476c-a532-74d54f9094a7/preview/sm", mediaType: "image" }],
      }),
    ).toBe(true);
  });

  it("does not flag canonical exercise snapshot", () => {
    expect(
      exerciseInstanceSnapshotNeedsCatalogRebuild({
        title: "Упр",
        media: [
          {
            url: "/api/media/7e07b4a9-51b9-476c-a532-74d54f9094a7",
            type: "video",
            previewSmUrl: "/api/media/7e07b4a9-51b9-476c-a532-74d54f9094a7/preview/sm",
          },
        ],
      }),
    ).toBe(false);
  });

  it("flags recommendation with preview-only mediaUrl", () => {
    expect(
      catalogMediaArrayHasPreviewOnlyUrls([
        { mediaUrl: "/api/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/preview/sm", mediaType: "image" },
      ]),
    ).toBe(true);
  });

  it("instanceStageItemSnapshotNeedsCatalogRebuild dispatches by type", () => {
    expect(
      instanceStageItemSnapshotNeedsCatalogRebuild("lesson", {
        media: [{ mediaUrl: "/api/media/x/preview/sm", mediaType: "image" }],
      }),
    ).toBe(false);
  });

  it("flags clinical_test draft preview in tests[].media", () => {
    expect(
      instanceStageItemSnapshotNeedsCatalogRebuild("clinical_test", {
        title: "Набор",
        tests: [
          {
            testId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            title: "Тест",
            media: [{ mediaUrl: "/api/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/preview/sm", mediaType: "image" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("exports SQL prefilter for backfill", () => {
    expect(EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE).toContain("ti.item_type = 'exercise'");
    expect(EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE).toContain("ti.item_type = 'recommendation'");
    expect(EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE).toContain("ti.item_type = 'clinical_test'");
    expect(EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE).toContain("@?");
  });
});
