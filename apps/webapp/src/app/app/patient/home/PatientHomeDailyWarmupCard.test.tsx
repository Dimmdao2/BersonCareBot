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
            contentPageId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
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

  it("shows pale green completed label and optional cooldown caption instead of link when warmupRecentlyCompletedHero", () => {
    render(
      <PatientHomeDailyWarmupCard
        personalTierOk
        anonymousGuest={false}
        warmupRecentlyCompletedHero
        warmupCooldownCaption="Разминка будет доступна через 19 минут."
        warmup={{
          blockItem,
          page: {
            contentPageId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            slug: "fixture-warmup",
            title: "Warmup",
            summary: "",
            imageUrl: null,
          },
        }}
      />,
    );
    expect(screen.getByRole("status", { name: /Разминка дня уже отмечена выполненной/i })).toHaveTextContent(
      /Разминка выполнена/i,
    );
    expect(screen.getByText(/Разминка будет доступна через 19 минут\./i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Начать разминку/i })).toBeNull();
  });
});
