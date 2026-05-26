/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  buildPatientDailyWarmupQuickListItems,
  PatientDailyWarmupQuickList,
} from "./PatientDailyWarmupQuickList";

const pages = [
  { slug: "warm-a", title: "Warm A", summary: "A", imageUrl: null },
  { slug: "warm-b", title: "Warm B", summary: "B", imageUrl: "/api/media/x" },
];

describe("PatientDailyWarmupQuickList", () => {
  it("returns null when only one warmup", () => {
    const { container } = render(
      <PatientDailyWarmupQuickList currentSlug="warm-a" pages={[pages[0]!]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("highlights current slug and links others with from=daily_warmup", () => {
    render(<PatientDailyWarmupQuickList currentSlug="warm-b" pages={pages} />);

    const linkA = screen.getByRole("link", { name: /Warm A/i });
    expect(linkA).toHaveAttribute("href", "/app/patient/content/warm-a?from=daily_warmup");
    expect(screen.queryByRole("link", { name: /Warm B/i })).toBeNull();
    expect(screen.getByText("Warm B")).toBeInTheDocument();
  });

  it("buildPatientDailyWarmupQuickListItems preserves sort order", () => {
    const items = buildPatientDailyWarmupQuickListItems("warm-a", pages);
    expect(items.map((i) => i.slug)).toEqual(["warm-a", "warm-b"]);
    expect(items[0]?.isCurrent).toBe(true);
    expect(items[1]?.href).toContain("from=daily_warmup");
  });
});
