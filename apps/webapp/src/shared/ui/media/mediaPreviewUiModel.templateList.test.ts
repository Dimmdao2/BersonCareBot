import { describe, expect, it } from "vitest";
import { templateListPreviewToPreviewUi } from "./mediaPreviewUiModel";

describe("templateListPreviewToPreviewUi", () => {
  it("uses source URL for image preview", () => {
    const ui = templateListPreviewToPreviewUi({
      mediaUrl: "/api/media/files/abc",
      mediaType: "image",
    });
    expect(ui.previewSmUrl).toBe("/api/media/files/abc");
    expect(ui.kind).toBe("image");
  });

  it("uses worker preview for video when previewSmUrl present", () => {
    const ui = templateListPreviewToPreviewUi({
      mediaUrl: "/api/media/files/vid",
      mediaType: "video",
      previewSmUrl: "/api/media/files/vid/preview/sm",
      previewStatus: "ready",
    });
    expect(ui.previewSmUrl).toBe("/api/media/files/vid/preview/sm");
    expect(ui.kind).toBe("video");
  });
});
