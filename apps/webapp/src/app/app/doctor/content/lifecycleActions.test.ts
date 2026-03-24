import { describe, expect, it, vi } from "vitest";

const updateLifecycle = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({ user: { userId: "d1", role: "doctor" } }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentPages: { updateLifecycle },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyContentLifecycle } from "./lifecycleActions";

describe("applyContentLifecycle", () => {
  it("archives a page", async () => {
    updateLifecycle.mockClear();
    const fd = new FormData();
    fd.set("id", "550e8400-e29b-41d4-a716-446655440000");
    fd.set("op", "archive");
    const res = await applyContentLifecycle(null, fd);
    expect(res.ok).toBe(true);
    expect(updateLifecycle).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      expect.objectContaining({ archivedAt: expect.any(String) }),
    );
  });
});
