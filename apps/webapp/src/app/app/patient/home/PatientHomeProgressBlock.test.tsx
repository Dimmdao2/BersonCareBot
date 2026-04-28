/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeProgressBlock } from "./PatientHomeProgressBlock";

describe("PatientHomeProgressBlock", () => {
  it("shows login hint for anonymous guest", () => {
    render(
      <PatientHomeProgressBlock practiceTarget={3} personalTierOk={false} anonymousGuest progress={null} />,
    );
    expect(screen.getByRole("link", { name: /Войдите/i })).toBeInTheDocument();
  });

  it("shows activation hint without tier", () => {
    render(
      <PatientHomeProgressBlock practiceTarget={3} personalTierOk={false} anonymousGuest={false} progress={null} />,
    );
    expect(screen.getByText(/Активируйте профиль пациента/i)).toBeInTheDocument();
  });

  it("shows counters for patient with progress", () => {
    render(
      <PatientHomeProgressBlock
        practiceTarget={3}
        personalTierOk
        anonymousGuest={false}
        progress={{ todayDone: 2, streak: 4 }}
      />,
    );
    expect(screen.getByText(/2 из 3/)).toBeInTheDocument();
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });
});
