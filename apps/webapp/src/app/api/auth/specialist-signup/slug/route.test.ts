import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stampBootstrapPrincipal: vi.fn(),
  checkAuthConfirmRateLimit: vi.fn(),
  getSpecialistSignupEnabled: vi.fn(),
  checkSlugAvailability: vi.fn(),
}));

vi.mock("@/app-layer/principal/bootstrapPrincipal", () => ({
  stampBootstrapPrincipal: (...args: unknown[]) => mocks.stampBootstrapPrincipal(...args),
}));

vi.mock("@/modules/auth/authConfirmRateLimit", () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: (...args: unknown[]) => mocks.checkAuthConfirmRateLimit(...args),
}));

vi.mock("@/modules/auth/specialistSignupRollout", () => ({
  getSpecialistSignupEnabled: () => mocks.getSpecialistSignupEnabled(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    clinicDirectory: {
      checkSlugAvailability: mocks.checkSlugAvailability,
    },
  }),
}));

import { POST } from "./route";

function request(slug: unknown) {
  return new Request("http://localhost/api/auth/specialist-signup/slug", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
}

describe("POST /api/auth/specialist-signup/slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkAuthConfirmRateLimit.mockResolvedValue({ limited: false });
    mocks.getSpecialistSignupEnabled.mockResolvedValue(true);
  });

  it("stamps bootstrap first and returns a non-enumerating rate-limit response before slug lookup", async () => {
    mocks.checkAuthConfirmRateLimit.mockResolvedValueOnce({
      limited: true,
      reason: "rate_limited",
    });
    const request = new Request("http://localhost/api/auth/specialist-signup/slug", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "available-or-not" }),
    });

    const response = await POST(request);

    expect(mocks.stampBootstrapPrincipal).toHaveBeenCalledWith(
      "api/auth/specialist-signup/slug:POST",
      request,
    );
    expect(mocks.stampBootstrapPrincipal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkAuthConfirmRateLimit.mock.invocationCallOrder[0]!,
    );
    expect(mocks.checkAuthConfirmRateLimit).toHaveBeenCalledWith(
      request,
      "specialist_signup_slug",
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 600,
    });
    expect(mocks.getSpecialistSignupEnabled).not.toHaveBeenCalled();
    expect(mocks.checkSlugAvailability).not.toHaveBeenCalled();
  });

  it.each([
    ["ab", "slug_too_short"],
    ["клиника!", "slug_invalid_characters"],
    ["book", "reserved_slug"],
  ])("returns the exact validation cause for %s", async (slug, code) => {
    mocks.checkSlugAvailability.mockResolvedValueOnce({ ok: false, code });

    const response = await POST(request(slug));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: code });
  });

  it("distinguishes a taken address from invalid input", async () => {
    mocks.checkSlugAvailability.mockResolvedValueOnce({
      ok: false,
      code: "slug_unavailable",
    });

    const response = await POST(request("taken-clinic"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "slug_unavailable",
    });
  });

  it("returns only the normalized free address", async () => {
    mocks.checkSlugAvailability.mockResolvedValueOnce({
      ok: true,
      slug: "clinic-one",
    });

    const response = await POST(request("Clinic One"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      slug: "clinic-one",
      available: true,
    });
  });
});
