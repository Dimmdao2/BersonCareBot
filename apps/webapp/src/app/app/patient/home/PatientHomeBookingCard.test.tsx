/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeBookingCard } from "./PatientHomeBookingCard";

describe("PatientHomeBookingCard", () => {
  it("uses booking and cabinet hrefs when authenticated", () => {
    render(
      <PatientHomeBookingCard
        bookingHref="/app/patient/booking"
        cabinetHref="/app/patient/cabinet"
        guestMode={false}
      />,
    );
    expect(screen.getByRole("link", { name: "Записаться" })).toHaveAttribute("href", "/app/patient/booking");
    expect(screen.getByRole("link", { name: "Мои приёмы" })).toHaveAttribute("href", "/app/patient/cabinet");
  });

  it("points both CTAs to login when guestMode", () => {
    render(
      <PatientHomeBookingCard bookingHref="/b" cabinetHref="/c" guestMode />,
    );
    const login = "/app?next=%2Fapp%2Fpatient";
    expect(screen.getByRole("link", { name: "Войти, чтобы записаться" })).toHaveAttribute("href", login);
    expect(screen.getByRole("link", { name: "Мои приёмы" })).toHaveAttribute("href", login);
  });
});
