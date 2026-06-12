/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExerciseMicroChart } from "./ExerciseMicroChart";
import type { ExerciseMetricPoint } from "./ExerciseMicroChart";

const ISO_BASE = "2026-06-10T10:00:00.000Z";

function makePoint(
  overrides: Partial<ExerciseMetricPoint> = {},
  offsetDays = 0,
): ExerciseMetricPoint {
  const d = new Date(ISO_BASE);
  d.setDate(d.getDate() + offsetDays);
  return {
    at: d.toISOString(),
    reps: null,
    weightKg: null,
    sets: null,
    difficulty: null,
    ...overrides,
  };
}

describe("ExerciseMicroChart", () => {
  it("renders empty-state when no points", () => {
    render(<ExerciseMicroChart points={[]} />);
    expect(screen.getByText(/нет данных/i)).toBeInTheDocument();
  });

  it("renders no-metrics placeholder when all points have null metrics", () => {
    const points = [makePoint(), makePoint({}, 1)];
    render(<ExerciseMicroChart points={points} />);
    expect(screen.getByText(/метрики не зафиксированы/i)).toBeInTheDocument();
  });

  it("shows reps metric label when reps are present", () => {
    const points = [makePoint({ reps: 10 }), makePoint({ reps: 15 }, 1)];
    render(<ExerciseMicroChart points={points} />);
    expect(screen.getByText("повт.")).toBeInTheDocument();
  });

  it("shows weightKg metric label when weight is present", () => {
    const points = [makePoint({ weightKg: 5.0 })];
    render(<ExerciseMicroChart points={points} />);
    expect(screen.getByText("кг")).toBeInTheDocument();
  });

  it("shows difficulty metric label when difficulty is present", () => {
    const points = [makePoint({ difficulty: "hard" })];
    render(<ExerciseMicroChart points={points} />);
    expect(screen.getByText("тяжесть")).toBeInTheDocument();
  });

  it("does NOT show sets label when all sets are null (Phase C not yet written)", () => {
    const points = [makePoint({ reps: 5 })];
    render(<ExerciseMicroChart points={points} />);
    expect(screen.queryByText("подх.")).not.toBeInTheDocument();
  });

  it("shows sets label when sets data is present (Phase C path)", () => {
    const points = [makePoint({ sets: 3 })];
    render(<ExerciseMicroChart points={points} />);
    expect(screen.getByText("подх.")).toBeInTheDocument();
  });

  it("renders multiple metric rows simultaneously", () => {
    const points = [makePoint({ reps: 10, weightKg: 5.0, difficulty: "easy" })];
    render(<ExerciseMicroChart points={points} />);
    expect(screen.getByText("повт.")).toBeInTheDocument();
    expect(screen.getByText("кг")).toBeInTheDocument();
    expect(screen.getByText("тяжесть")).toBeInTheDocument();
  });

  it("shows correct count of bars for reps (one per point with non-null reps)", () => {
    // 2 points with reps, 1 without
    const points = [
      makePoint({ reps: 10 }),
      makePoint({ reps: null }, 1),
      makePoint({ reps: 20 }, 2),
    ];
    const { container } = render(<ExerciseMicroChart points={points} />);
    // bars are divs with w-4 class (NumericBar)
    const bars = container.querySelectorAll(".w-4");
    expect(bars.length).toBe(2);
  });

  it("orders points old-to-new (ascending by at)", () => {
    // Recent point first in array — component should sort ascending
    const newer = makePoint({ reps: 20 }, 5);
    const older = makePoint({ reps: 5 }, 0);
    const { container } = render(<ExerciseMicroChart points={[newer, older]} />);
    // Bar wrappers with title="<date>: <value>" appear in DOM left-to-right (old→new)
    const barWrappers = container.querySelectorAll("[title]");
    const titles = Array.from(barWrappers).map((el) => el.getAttribute("title") ?? "");
    // older ISO date → lower string → sorted first
    const olderDate = new Date(older.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit" });
    const newerDate = new Date(newer.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit" });
    expect(titles[0]).toContain(olderDate);
    expect(titles[1]).toContain(newerDate);
  });
});
