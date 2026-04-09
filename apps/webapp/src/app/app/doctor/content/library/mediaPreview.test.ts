import { describe, expect, it } from "vitest";
import { canRenderInlineImage } from "./mediaPreview";

describe("canRenderInlineImage", () => {
  it("allows safe raster image MIME types", () => {
    expect(canRenderInlineImage("image/png")).toBe(true);
    expect(canRenderInlineImage("image/heic")).toBe(true);
  });

  it("blocks SVG from inline rendering", () => {
    expect(canRenderInlineImage("image/svg+xml")).toBe(false);
    expect(canRenderInlineImage(" IMAGE/SVG+XML ")).toBe(false);
  });

  it("returns false for non-image MIME types", () => {
    expect(canRenderInlineImage("application/pdf")).toBe(false);
  });
});
