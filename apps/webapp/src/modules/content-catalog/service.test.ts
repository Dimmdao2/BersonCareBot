import { describe, expect, it } from "vitest";
import { createContentCatalogResolver } from "./service";

describe("content-catalog resolver", () => {
  it("getBySlug returns item for known slug", async () => {
    const resolver = createContentCatalogResolver({});
    const item = await resolver.getBySlug("back-pain");
    expect(item).not.toBeNull();
    expect(item!.slug).toBe("back-pain");
    expect(item!.title).toBe("Острая боль в спине");
    expect(item!.bodyText).toBeDefined();
    expect(item!.videoSource).toBeUndefined();
  });

  it("getBySlug returns null for unknown slug", async () => {
    const resolver = createContentCatalogResolver({});
    expect(await resolver.getBySlug("unknown-slug")).toBeNull();
  });

  it("test-video gets videoSource when testVideoUrl is provided", async () => {
    const resolver = createContentCatalogResolver({
      testVideoUrl: "https://example.com/test.mp4",
    });
    const item = await resolver.getBySlug("test-video");
    expect(item).not.toBeNull();
    expect(item!.videoSource).toEqual({ type: "url", url: "https://example.com/test.mp4" });
  });

  it("test-video has no videoSource when testVideoUrl is empty", async () => {
    const resolver = createContentCatalogResolver({ testVideoUrl: "" });
    const item = await resolver.getBySlug("test-video");
    expect(item).not.toBeNull();
    expect(item!.videoSource).toBeUndefined();
  });
});
