/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PatientHomeBlockItem } from "@/modules/patient-home/ports";
import { PatientHomeDailyWarmupCard } from "./PatientHomeDailyWarmupCard";

const blockItem: PatientHomeBlockItem = {
  id: "item-1",
  blockCode: "daily_warmup",
  targetType: "content_page",
  targetRef: "fixture-warmup",
  titleOverride: null,
  subtitleOverride: null,
  imageUrlOverride: null,
  badgeLabel: null,
  isVisible: true,
  sortOrder: 0,
};

describe("PatientHomeDailyWarmupCard", () => {
  it("includes from=daily_warmup on warmup link", () => {
    render(
      <PatientHomeDailyWarmupCard
        personalTierOk
        anonymousGuest={false}
        warmup={{
          blockItem,
          page: {
            slug: "fixture-warmup",
            title: "Warmup",
            summary: "",
            imageUrl: null,
          },
        }}
      />,
    );
    const link = screen.getByRole("link", { name: /Начать разминку/i });
    expect(link.getAttribute("href")).toContain("from=daily_warmup");
    expect(link.getAttribute("href")).toContain("/app/patient/content/");
  });
});
