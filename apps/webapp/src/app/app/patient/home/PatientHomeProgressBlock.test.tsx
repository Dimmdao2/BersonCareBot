/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeProgressBlock } from "./PatientHomeProgressBlock";

const baseMetrics = {
  warmupPlanned: 2,
  warmupDone: 1,
  trainingPlanned: 1,
  trainingDone: 1,
  streakDays: 2,
  doneTotal: 2,
  plannedTotal: 3,
};

describe("PatientHomeProgressBlock", () => {
  it("shows login hint for anonymous guest", () => {
    render(<PatientHomeProgressBlock metrics={null} anonymousGuest />);
    expect(screen.getByRole("link", { name: /Войдите/i })).toBeInTheDocument();
  });

  it("shows counters and incomplete goals flame copy", () => {
    render(<PatientHomeProgressBlock metrics={baseMetrics} anonymousGuest={false} />);
    expect(
      screen.getByLabelText(
        /^Выполнено сегодня: 2 из 3\. Разминки: 1 из 2\. Тренировки: 1 из 1\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Разминки 1 из 2/)).toBeInTheDocument();
    expect(screen.getByText(/Тренировки 1 из 1/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Еще немного и все получится!/i)).toBeInTheDocument();
  });

  it("shows met goals flame copy when done equals plan", () => {
    render(
      <PatientHomeProgressBlock
        metrics={{ ...baseMetrics, warmupDone: 2, trainingDone: 1, doneTotal: 3 }}
        anonymousGuest={false}
      />,
    );
    expect(screen.getByLabelText(/Все цели выполнены!/)).toBeInTheDocument();
  });

  it("shows exceeded goals flame copy when done is above plan", () => {
    render(
      <PatientHomeProgressBlock
        metrics={{ ...baseMetrics, trainingDone: 2, doneTotal: 4 }}
        anonymousGuest={false}
      />,
    );
    expect(screen.getByLabelText(/Цели перевыполнены! Так держать!/i)).toBeInTheDocument();
  });
});
