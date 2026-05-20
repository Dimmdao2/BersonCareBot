/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeProgressBlock } from "./PatientHomeProgressBlock";

const sampleMetrics = {
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

  it("shows counters aligned with five metrics", () => {
    render(<PatientHomeProgressBlock metrics={sampleMetrics} anonymousGuest={false} />);
    expect(
      screen.getByLabelText(
        /^Выполнено сегодня: 2 из 3\. Разминки: 1 из 2\. Тренировки: 1 из 1\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Разминки 1 из 2/)).toBeInTheDocument();
    expect(screen.getByText(/Тренировки 1 из 1/)).toBeInTheDocument();
    expect(screen.getByText(/^дня$/)).toBeInTheDocument();
  });
});
