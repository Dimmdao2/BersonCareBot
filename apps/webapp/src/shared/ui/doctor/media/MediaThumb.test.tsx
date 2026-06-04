/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MediaThumb } from "./MediaThumb";
import type { MediaPreviewUiModel } from "./mediaPreviewUiModel";

const ORIGINAL = "https://cdn.example/original-huge.jpg";

function baseMedia(over: Partial<MediaPreviewUiModel> = {}): MediaPreviewUiModel {
  return {
    id: "m1",
    kind: "image",
    url: ORIGINAL,
    previewStatus: null,
    previewSmUrl: null,
    previewMdUrl: null,
    ...over,
  };
}

describe("MediaThumb", () => {
  it("renders <img> with previewSmUrl when phase is ready", () => {
    const sm = "/api/media/11111111-1111-4111-8111-111111111111/preview/sm";
    const { container } = render(
      <MediaThumb
        media={baseMedia({
          previewStatus: "ready",
          previewSmUrl: sm,
          previewMdUrl: "/api/media/11111111-1111-4111-8111-111111111111/preview/md",
        })}
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(sm);
  });

  it("does not render <img> for pending — no fallback to original url", () => {
    const { container } = render(<MediaThumb media={baseMedia({ previewStatus: "pending", previewSmUrl: null })} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("does not render <img> for failed — no fallback to original url", () => {
    const { container } = render(<MediaThumb media={baseMedia({ previewStatus: "failed", previewSmUrl: null })} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toMatch(/Превью недоступно/);
  });

  it("never uses media.url as img src", () => {
    const { container } = render(
      <MediaThumb
        media={baseMedia({
          previewStatus: "ready",
          previewSmUrl: "/api/media/11111111-1111-4111-8111-111111111111/preview/sm",
        })}
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).not.toBe(ORIGINAL);
  });
});
