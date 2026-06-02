import { describe, expect, it } from "vitest";
import {
  freeformRecommendationDraftSnapshot,
  libraryRowToItemDraftSnapshot,
} from "./treatmentProgramLibraryDraftSnapshot";

describe("treatmentProgramLibraryDraftSnapshot", () => {
  it("libraryRowToItemDraftSnapshot — exercise with thumb", () => {
    const snap = libraryRowToItemDraftSnapshot(
      { id: "ex-1", title: "Присед", thumbUrl: "https://example.com/a.jpg" },
      "exercise",
    );
    expect(snap.title).toBe("Присед");
    expect(snap.media).toEqual([{ mediaUrl: "https://example.com/a.jpg", mediaType: "image", sortOrder: 0 }]);
  });

  it("libraryRowToItemDraftSnapshot — clinical_test uses tests[] shape", () => {
    const snap = libraryRowToItemDraftSnapshot(
      { id: "t-1", title: "Тест A", thumbUrl: "https://example.com/t.jpg" },
      "clinical_test",
    );
    expect(snap.tests).toEqual([
      expect.objectContaining({
        testId: "t-1",
        title: "Тест A",
        media: [{ mediaUrl: "https://example.com/t.jpg", mediaType: "image", sortOrder: 0 }],
      }),
    ]);
  });

  it("freeformRecommendationDraftSnapshot", () => {
    expect(freeformRecommendationDraftSnapshot("Заголовок", "Тело")).toEqual({
      title: "Заголовок",
      bodyMd: "Тело",
    });
  });
});
