import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it, vi } from "vitest";
import { redirectIfPatientActivationRequired } from "./bookingPatientActivation";

function mockRouter(push: ReturnType<typeof vi.fn>): AppRouterInstance {
  return { push } as unknown as AppRouterInstance;
}

describe("redirectIfPatientActivationRequired", () => {
  it("redirects on booking_phone_trust_required using redirectTo when safe", () => {
    const push = vi.fn();
    const ok = redirectIfPatientActivationRequired(
      {
        error: "booking_phone_trust_required",
        redirectTo: "/app/patient/bind-phone?next=%2Fapp%2Fpatient%2Fbooking%2Fnew",
      },
      mockRouter(push),
    );
    expect(ok).toBe(true);
    expect(push).toHaveBeenCalledWith("/app/patient/bind-phone?next=%2Fapp%2Fpatient%2Fbooking%2Fnew");
  });

  it("redirects on patient_activation_required to bind-phone when redirectTo missing", () => {
    const push = vi.fn();
    const ok = redirectIfPatientActivationRequired({ error: "patient_activation_required" }, mockRouter(push));
    expect(ok).toBe(true);
    expect(push).toHaveBeenCalledWith("/app/patient/bind-phone");
  });

  it("returns false for unrelated errors", () => {
    const push = vi.fn();
    expect(redirectIfPatientActivationRequired({ error: "slot_overlap" }, mockRouter(push))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
