/** @vitest-environment node */

import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("sharp 0.35 media preview compatibility", () => {
  it("loads the native runtime and preserves the RGBA PNG to JPEG preview path", async () => {
    expect(sharp.versions.sharp).toBe("0.35.3");

    const original = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 4,
        background: { r: 24, g: 96, b: 160, alpha: 0.75 },
      },
    })
      .png()
      .toBuffer();

    const sourceMetadata = await sharp(original).metadata();
    expect(sourceMetadata).toMatchObject({
      format: "png",
      width: 32,
      height: 24,
      channels: 4,
    });

    const preview = await sharp(original)
      .rotate()
      .resize(16, 16, { fit: "inside" })
      .jpeg({ quality: 82 })
      .toBuffer();
    const previewMetadata = await sharp(preview).metadata();

    expect(previewMetadata).toMatchObject({
      format: "jpeg",
      width: 16,
      height: 12,
      channels: 3,
    });
  });
});
