import { beforeEach, describe, expect, it, vi } from "vitest";

const reorderSlugsMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({ user: { id: "doc-1" } }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: { reorderSlugs: reorderSlugsMock },
  }),
}));

import { reorderContentSections } from "./reorderContentSections";

describe("reorderContentSections", () => {
  beforeEach(() => {
    reorderSlugsMock.mockReset();
    reorderSlugsMock.mockResolvedValue(undefined);
  });

  it("calls port with ordered slugs", async () => {
    const res = await reorderContentSections(["a", "b"]);
    expect(res.ok).toBe(true);
    expect(reorderSlugsMock).toHaveBeenCalledWith(["a", "b"]);
  });

  it("rejects empty array", async () => {
    const res = await reorderContentSections([]);
    expect(res.ok).toBe(false);
    expect(reorderSlugsMock).not.toHaveBeenCalled();
  });
});
