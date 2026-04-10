import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

import { patientOnboardingServerActionSurfaceOk } from "./onboardingServerActionSurface";

describe("patientOnboardingServerActionSurfaceOk (D-SA-1 / Phase E re-audit)", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    headersMock.mockReset();
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("returns true when x-bc-pathname is /app/patient/profile", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "x-bc-pathname" ? "/app/patient/profile" : null),
    });
    expect(await patientOnboardingServerActionSurfaceOk()).toBe(true);
  });

  it("returns false for /app/patient/reminders (not onboarding action surface)", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "x-bc-pathname" ? "/app/patient/reminders" : null),
    });
    expect(await patientOnboardingServerActionSurfaceOk()).toBe(false);
  });

  it("falls back to referer pathname when x-bc-pathname missing", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => {
        if (name === "x-bc-pathname") return "";
        if (name === "referer") return "https://app.example/app/patient/profile?tab=1";
        return null;
      },
    });
    expect(await patientOnboardingServerActionSurfaceOk()).toBe(true);
  });

  it("returns false when both headers missing (defense in depth)", async () => {
    headersMock.mockResolvedValue({
      get: () => null,
    });
    expect(await patientOnboardingServerActionSurfaceOk()).toBe(false);
  });
});
