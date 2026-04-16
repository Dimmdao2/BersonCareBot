import { describe, expect, it } from "vitest";
import { markdownSnippetForMediaUrl } from "./markdownMediaSnippet";

describe("markdownSnippetForMediaUrl", () => {
  it("uses image syntax for kind image", () => {
    expect(markdownSnippetForMediaUrl("/api/media/x", "a.heic", { kind: "image", mimeType: "image/heic" })).toBe(
      "![a.heic](/api/media/x)\n",
    );
  });

  it("uses image syntax for mime image without known extension", () => {
    expect(
      markdownSnippetForMediaUrl("/api/media/x", "blob", { kind: "image", mimeType: "image/avif" }),
    ).toBe("![blob](/api/media/x)\n");
  });

  it("uses link syntax for non-image", () => {
    expect(markdownSnippetForMediaUrl("/api/media/x", "d.pdf", { kind: "file", mimeType: "application/pdf" })).toBe(
      "[d.pdf](/api/media/x)\n",
    );
  });
});
