import { describe, expect, it } from "vitest";
import { exerciseMediaTypeFromPick } from "./exerciseMediaFromLibrary";

describe("exerciseMediaTypeFromPick", () => {
  it("maps video kind to video", () => {
    expect(
      exerciseMediaTypeFromPick({
        kind: "video",
        mimeType: "video/mp4",
        filename: "clip.mp4",
      }),
    ).toBe("video");
  });

  it("maps image/gif mime to gif", () => {
    expect(
      exerciseMediaTypeFromPick({
        kind: "image",
        mimeType: "image/gif",
        filename: "a.gif",
      }),
    ).toBe("gif");
  });

  it("maps .gif filename to gif", () => {
    expect(
      exerciseMediaTypeFromPick({
        kind: "image",
        mimeType: "image/png",
        filename: "x.GIF",
      }),
    ).toBe("gif");
  });

  it("maps static image to image", () => {
    expect(
      exerciseMediaTypeFromPick({
        kind: "image",
        mimeType: "image/jpeg",
        filename: "pic.jpg",
      }),
    ).toBe("image");
  });
});
