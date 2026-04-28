/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeBookingCard } from "./PatientHomeBookingCard";

describe("PatientHomeBookingCard", () => {
  it("shows activate profile when personalTierOk is false", () => {
    render(<PatientHomeBookingCard personalTierOk={false} />);
    expect(screen.getByRole("link", { name: /Активировать профиль/i })).toBeInTheDocument();
  });

  it("hides activate profile when personalTierOk is true", () => {
    render(<PatientHomeBookingCard personalTierOk />);
    expect(screen.queryByRole("link", { name: /Активировать профиль/i })).toBeNull();
  });
});
