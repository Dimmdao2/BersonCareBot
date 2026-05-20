/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientDailyWarmupPager } from "./PatientDailyWarmupPager";

describe("PatientDailyWarmupPager", () => {
  const nav = {
    index: 1,
    total: 3,
    prevHref: "/app/patient/content/a?from=daily_warmup",
    nextHref: "/app/patient/content/c?from=daily_warmup",
  };

  it("renders sticky pager with position label and navigation links", () => {
    render(<PatientDailyWarmupPager nav={nav} />);
    const navEl = screen.getByRole("navigation", { name: "Навигация по разминкам дня" });
    expect(navEl).toHaveClass("sticky", "top-0");
    expect(screen.getByText("Разминка дня")).toBeInTheDocument();
    expect(screen.getByText("2 из 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Предыдущая разминка" })).toHaveAttribute("href", nav.prevHref);
    expect(screen.getByRole("link", { name: "Следующая разминка" })).toHaveAttribute("href", nav.nextHref);
  });
});
