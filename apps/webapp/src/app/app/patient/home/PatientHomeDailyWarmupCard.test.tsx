/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeDailyWarmupCard } from "./PatientHomeDailyWarmupCard";

describe("PatientHomeDailyWarmupCard", () => {
  it("renders CTA and from query in href", () => {
    render(
      <PatientHomeDailyWarmupCard
        title="Разминка шеи"
        summary="Короткая серия движений"
        href="/app/patient/sections/neck?from=daily_warmup"
        durationMinutes={8}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Разминка шеи");
    const link = screen.getByRole("link", { name: "Начать разминку" });
    expect(link).toHaveAttribute("href", "/app/patient/sections/neck?from=daily_warmup");
    expect(screen.getByText("8 мин")).toBeInTheDocument();
  });

  it("uses duration fallback when minutes missing", () => {
    render(
      <PatientHomeDailyWarmupCard title="T" summary="S" href="/h" durationMinutes={null} />,
    );
    expect(screen.getByText("≈ 5 мин")).toBeInTheDocument();
  });

  it("renders image when imageUrl provided", () => {
    const { container } = render(
      <PatientHomeDailyWarmupCard
        title="T"
        summary="S"
        href="/h"
        imageUrl="https://example.com/warmup.png"
        durationMinutes={null}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute("src", "https://example.com/warmup.png");
  });

  it("uses non-image decorative fallback when imageUrl absent", () => {
    const { container } = render(<PatientHomeDailyWarmupCard title="T" summary="S" href="/h" durationMinutes={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
