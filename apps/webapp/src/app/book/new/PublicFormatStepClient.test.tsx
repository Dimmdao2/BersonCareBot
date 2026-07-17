/** @vitest-environment jsdom */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicFormatStepClient } from "./PublicFormatStepClient";
import type { BookingCity } from "@/modules/booking-catalog/types";

function city(overrides: Partial<BookingCity> = {}): BookingCity {
  return {
    id: "550e8400-e29b-41d4-a716-446655440010",
    code: "moscow",
    title: "Москва",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("PublicFormatStepClient", () => {
  it("carries orgSlug into the service-step link on the canonical per-clinic entry /book/{slug}", () => {
    render(<PublicFormatStepClient cities={[city()]} catalogError={null} orgSlug="saas-test-clinic-a" />);
    const link = screen.getByRole("link", { name: /Москва/ });
    expect(link.getAttribute("href")).toContain(`orgSlug=${encodeURIComponent("saas-test-clinic-a")}`);
  });

  it("omits orgSlug on the generic /book entry", () => {
    render(<PublicFormatStepClient cities={[city()]} catalogError={null} />);
    const link = screen.getByRole("link", { name: /Москва/ });
    expect(link.getAttribute("href")).not.toContain("orgSlug=");
  });
});
