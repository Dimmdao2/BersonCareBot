import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error("NEXT_REDIRECT");
  },
}));

import DoctorAdminBookingIntegrationsPage from "./page";

describe("DoctorAdminBookingIntegrationsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects the retired Rubitime settings URL to canonical booking settings", () => {
    expect(() => DoctorAdminBookingIntegrationsPage()).toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/app/doctor/admin/booking");
  });
});
