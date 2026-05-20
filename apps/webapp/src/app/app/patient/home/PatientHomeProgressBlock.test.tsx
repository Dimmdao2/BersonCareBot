/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeProgressBlock } from "./PatientHomeProgressBlock";

describe("PatientHomeProgressBlock", () => {
  it("shows login hint for anonymous guest", () => {
    render(
      <PatientHomeProgressBlock practiceTarget={3} anonymousGuest progress={null} />,
    );
    expect(screen.getByRole("link", { name: /Войдите/i })).toBeInTheDocument();
  });

  it("shows counters when logged in with progress data", () => {
    render(
      <PatientHomeProgressBlock practiceTarget={3} anonymousGuest={false} progress={{ todayDone: 1, streak: 2 }} />,
    );
    expect(screen.getByLabelText(/Выполнено сегодня: 1 из 3/)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it("shows counters for patient with progress", () => {
    render(
      <PatientHomeProgressBlock
        practiceTarget={3}
        anonymousGuest={false}
        progress={{ todayDone: 2, streak: 4 }}
      />,
    );
    expect(screen.getByLabelText(/Выполнено сегодня: 2 из 3/)).toHaveTextContent(/2/);
    expect(screen.getByLabelText(/Выполнено сегодня: 2 из 3/)).toHaveTextContent(/из/);
    expect(screen.getByLabelText(/Выполнено сегодня: 2 из 3/)).toHaveTextContent(/3/);
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });

  it("renders custom streak icon when blockIconImageUrl is set", () => {
    const { container } = render(
      <PatientHomeProgressBlock
        practiceTarget={3}
        anonymousGuest={false}
        progress={{ todayDone: 2, streak: 4 }}
        blockIconImageUrl="/api/media/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/media/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/preview/sm");
  });

  it("shows micro goal breakdown labels and extended aria-label when progressGoalBreakdown is set", () => {
    render(
      <PatientHomeProgressBlock
        practiceTarget={4}
        anonymousGuest={false}
        progress={{ todayDone: 1, streak: 2 }}
        progressGoalBreakdown={{ warmupDone: 2, warmupPlanned: 2, lfkDone: 0, lfkPlanned: 2 }}
      />,
    );
    expect(screen.getByText(/Разминки 2 из 2/)).toBeInTheDocument();
    expect(screen.getByText(/Тренировки 0 из 2/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        /^Выполнено сегодня: 1 из 4\. Разминки: 2 из 2\. Тренировки: 0 из 2\.$/,
      ),
    ).toBeInTheDocument();
  });

  it("does not render breakdown when both warmup and lfk counts are zero", () => {
    render(
      <PatientHomeProgressBlock
        practiceTarget={4}
        anonymousGuest={false}
        progress={{ todayDone: 1, streak: 2 }}
        progressGoalBreakdown={{ warmupDone: 0, warmupPlanned: 0, lfkDone: 0, lfkPlanned: 0 }}
      />,
    );
    expect(screen.queryByText(/Разминки/)).toBeNull();
    expect(screen.getByLabelText(/^Выполнено сегодня: 1 из 4$/)).toBeInTheDocument();
  });
});
