import { beforeEach, describe, expect, it, vi } from "vitest";

const checkSlugAvailabilityMock = vi.fn();
const getSpecialistSignupEnabledMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    clinicDirectory: {
      checkSlugAvailability: checkSlugAvailabilityMock,
    },
  }),
}));

vi.mock("@/modules/auth/specialistSignupRollout", () => ({
  getSpecialistSignupEnabled: () => getSpecialistSignupEnabledMock(),
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
    getSpecialistSignupEnabledMock.mockResolvedValue(true);
  });

  it.each([
    ["ab", "slug_too_short"],
    ["клиника!", "slug_invalid_characters"],
    ["book", "reserved_slug"],
  ])("returns the exact validation cause for %s", async (slug, code) => {
    checkSlugAvailabilityMock.mockResolvedValueOnce({ ok: false, code });

    const response = await POST(request(slug));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: code });
  });

  it("distinguishes a taken address from invalid input", async () => {
    checkSlugAvailabilityMock.mockResolvedValueOnce({
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
    checkSlugAvailabilityMock.mockResolvedValueOnce({
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
