/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ClinicSlugSection, clinicSlugErrorMessage } from "./ClinicSlugSection";

describe("clinicSlugErrorMessage", () => {
  it("keeps taken, invalid-character, and too-short failures distinct and actionable", () => {
    expect(clinicSlugErrorMessage("slug_unavailable")).toBe(
      "Этот адрес уже занят. Выберите другой.",
    );
    expect(clinicSlugErrorMessage("slug_invalid_characters")).toBe(
      "Используйте только латинские буквы, цифры и дефисы.",
    );
    expect(clinicSlugErrorMessage("slug_too_short")).toBe(
      "Адрес должен содержать минимум 3 символа.",
    );
  });

  it("shows the full canonical public URL and an explicit copy affordance", () => {
    render(
      <ClinicSlugSection
        initialState={{ currentSlug: "clinic-a" }}
        appBaseUrl="https://app.example/"
      />,
    );

    expect(screen.getByRole("link", { name: "https://app.example/book/clinic-a" })).toHaveAttribute(
      "href",
      "https://app.example/book/clinic-a",
    );
    expect(screen.getByRole("button", { name: "Скопировать" })).toBeEnabled();
  });

  it("states the irreversible alias policy before rename confirmation", async () => {
    const user = userEvent.setup();
    render(
      <ClinicSlugSection
        initialState={{ currentSlug: "clinic-a" }}
        appBaseUrl="https://app.example"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Изменить адрес" }));

    expect(
      screen.getByText(
        "Старый адрес будет работать всегда и навсегда останется привязан к этой клинике.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Переименовать" })).toBeDisabled();
  });
});
