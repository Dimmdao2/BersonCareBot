/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeBookingCard } from "./PatientHomeBookingCard";

describe("PatientHomeBookingCard", () => {
  it("shows activate profile when personalTierOk is false and not anonymous", () => {
    render(<PatientHomeBookingCard personalTierOk={false} anonymousGuest={false} />);
    expect(screen.getByRole("link", { name: /Активировать профиль/i })).toBeInTheDocument();
  });

  it("hides activate profile when personalTierOk is true", () => {
    render(<PatientHomeBookingCard personalTierOk anonymousGuest={false} />);
    expect(screen.queryByRole("link", { name: /Активировать профиль/i })).toBeNull();
  });

  it("shows login CTAs when anonymousGuest", () => {
    render(<PatientHomeBookingCard personalTierOk={false} anonymousGuest />);
    expect(screen.getByRole("link", { name: /Войти, чтобы записаться/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Войти$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Активировать профиль/i })).toBeNull();
  });

  it("renders custom block icon when blockIconImageUrl is set", () => {
    const { container } = render(
      <PatientHomeBookingCard
        personalTierOk
        anonymousGuest={false}
        blockIconImageUrl="/api/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute("src", "/api/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});
