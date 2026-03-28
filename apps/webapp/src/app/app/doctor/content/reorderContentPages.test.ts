import { beforeEach, describe, expect, it, vi } from "vitest";

const reorderMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({ user: { id: "doc-1" } }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentPages: { reorderInSection: reorderMock },
  }),
}));

import { reorderContentPagesInSection } from "./reorderContentPages";

describe("reorderContentPagesInSection", () => {
  beforeEach(() => {
    reorderMock.mockReset();
    reorderMock.mockResolvedValue(undefined);
  });

  it("calls port with section and ordered ids", async () => {
    const res = await reorderContentPagesInSection("lessons", ["a", "b"]);
    expect(res.ok).toBe(true);
    expect(reorderMock).toHaveBeenCalledWith("lessons", ["a", "b"]);
  });

  it("rejects empty ordered ids", async () => {
    const res = await reorderContentPagesInSection("lessons", []);
    expect(res.ok).toBe(false);
    expect(reorderMock).not.toHaveBeenCalled();
  });
});
