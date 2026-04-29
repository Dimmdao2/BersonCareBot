/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeSosCard } from "./PatientHomeSosCard";

describe("PatientHomeSosCard", () => {
  it("keeps red icon column and danger button; image is decorative", () => {
    render(
      <PatientHomeSosCard
        title="Если болит сейчас"
        description="Скорая помощь и безопасные шаги."
        href="/app/patient/sections/emergency"
        buttonLabel="Перейти к материалам"
        imageUrl="https://example.com/x.png"
      />,
    );
    expect(screen.getByRole("link", { name: "Перейти к материалам" })).toHaveAttribute(
      "href",
      "/app/patient/sections/emergency",
    );
    expect(screen.getByRole("heading", { name: "Если болит сейчас" })).toBeInTheDocument();
    expect(document.querySelector(".rounded-full")).toBeTruthy();
    expect(document.querySelector("img")).toBeTruthy();
  });

  it("renders without image", () => {
    const { container } = render(
      <PatientHomeSosCard
        title="Если болит сейчас"
        description="Текст"
        href="/e"
        buttonLabel="Далее"
      />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
