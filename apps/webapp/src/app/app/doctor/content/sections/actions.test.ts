/**
 * Doctor section slug rename server action.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { RenameSectionSlugResult } from "@/infra/repos/pgContentSections";

const renameMock = vi.hoisted(() =>
  vi.fn(async (_old: string, _new: string): Promise<RenameSectionSlugResult> => ({
    ok: true,
    newSlug: "new-slug",
  })),
);
const redirectMock = vi.hoisted(() => vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: {
      renameSectionSlug: renameMock,
    },
  }),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn(async () => ({
    user: {
      userId: "00000000-0000-4000-8000-000000000099",
      role: "doctor" as const,
      displayName: "Doc",
      bindings: {},
    },
    issuedAt: 1,
    expiresAt: 9e9,
  })),
}));

import { renameContentSectionSlug } from "./actions";

describe("renameContentSectionSlug", () => {
  beforeEach(() => {
    renameMock.mockReset();
    renameMock.mockResolvedValue({ ok: true, newSlug: "new-slug" });
    redirectMock.mockReset();
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it("requires confirm checkbox", async () => {
    const fd = new FormData();
    fd.set("old_slug", "old");
    fd.set("new_slug", "new-slug");
    const r = await renameContentSectionSlug(null, fd);
    expect(r.ok).toBe(false);
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("returns error from port without redirect", async () => {
    renameMock.mockResolvedValueOnce({ ok: false, error: "Раздел с таким slug уже существует" });
    const fd = new FormData();
    fd.set("old_slug", "old");
    fd.set("new_slug", "taken");
    fd.set("confirm_rename", "on");
    const r = await renameContentSectionSlug(null, fd);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("уже существует");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to edit page for new slug on success", async () => {
    const fd = new FormData();
    fd.set("old_slug", "old");
    fd.set("new_slug", "new-slug");
    fd.set("confirm_rename", "on");
    await expect(renameContentSectionSlug(null, fd)).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith("/app/doctor/content/sections/edit/new-slug");
  });
});
