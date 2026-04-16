/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LfkComplexCard } from "./LfkComplexCard";

const MEDIA_ID = "11111111-1111-4111-8111-111111111111";

describe("LfkComplexCard", () => {
  it("does not render <img src={coverImageUrl}> when preview is absent — skeleton, not original", () => {
    const coverUrl = `/api/media/${MEDIA_ID}`;
    const { container } = render(
      <LfkComplexCard
        complex={{
          id: "c1",
          title: "Комплекс",
          origin: "manual",
          coverImageUrl: coverUrl,
          coverPreviewSmUrl: null,
          coverPreviewMdUrl: null,
          coverPreviewStatus: undefined,
          coverKind: "image",
        }}
        hasReminder={false}
        onBellClick={() => {}}
      />,
    );

    const imgs = container.querySelectorAll("img");
    for (const img of imgs) {
      expect(img.getAttribute("src")).not.toBe(coverUrl);
    }
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders preview <img> when coverPreviewSmUrl is ready", () => {
    const sm = `/api/media/${MEDIA_ID}/preview/sm`;
    const { container } = render(
      <LfkComplexCard
        complex={{
          id: "c2",
          title: "Комплекс 2",
          origin: "manual",
          coverImageUrl: `/api/media/${MEDIA_ID}`,
          coverPreviewSmUrl: sm,
          coverPreviewMdUrl: null,
          coverPreviewStatus: "ready",
          coverKind: "image",
        }}
        hasReminder={false}
        onBellClick={() => {}}
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(sm);
  });
});
