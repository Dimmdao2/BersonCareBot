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

  it("renders position label and navigation links", () => {
    render(<PatientDailyWarmupPager nav={nav} />);
    expect(screen.getByText("Разминка дня 2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Предыдущая разминка" })).toHaveAttribute("href", nav.prevHref);
    expect(screen.getByRole("link", { name: "Следующая разминка" })).toHaveAttribute("href", nav.nextHref);
  });
});
