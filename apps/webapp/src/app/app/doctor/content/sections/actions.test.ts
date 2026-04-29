import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();
const renameSectionSlugMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({
    user: { userId: "00000000-0000-4000-8000-000000000001" },
  }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: {
      upsert: upsertMock,
      renameSectionSlug: renameSectionSlugMock,
    },
  }),
}));

import { revalidatePath } from "next/cache";
import { renameContentSectionSlug, saveContentSection } from "./actions";

function formWith(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

describe("saveContentSection", () => {
  beforeEach(() => {
    upsertMock.mockClear();
    renameSectionSlugMock.mockReset();
    vi.mocked(revalidatePath).mockClear();
  });

  it("saves when title and slug valid", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      slug: "new-sec",
      title: "Новый раздел",
      description: "d",
      sort_order: "1",
      is_visible: "on",
      cover_image_url: "/api/media/123e4567-e89b-12d3-a456-426614174000",
      icon_image_url: "",
    });
    const res = await saveContentSection(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "new-sec",
        title: "Новый раздел",
        isVisible: true,
      }),
    );
  });

  it("rejects missing title", async () => {
    const fd = formWith({ slug: "x", title: "", description: "" });
    const res = await saveContentSection(null, fd);
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects invalid slug", async () => {
    const fd = formWith({ slug: "Bad_Slug", title: "T", description: "" });
    const res = await saveContentSection(null, fd);
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects slug consisting only of hyphens", async () => {
    const fd = formWith({ slug: "---", title: "T", description: "" });
    const res = await saveContentSection(null, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("дефис");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects invalid cover image url", async () => {
    const fd = formWith({
      slug: "ok-sec",
      title: "T",
      description: "",
      cover_image_url: "/uploads/legacy.png",
      icon_image_url: "",
    });
    const res = await saveContentSection(null, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Обложка");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("renames section slug through content sections port", async () => {
    renameSectionSlugMock.mockResolvedValue({ ok: true, newSlug: "new-sec" });
    const fd = formWith({
      old_slug: "old-sec",
      new_slug: "new-sec",
      confirm_rename: "on",
    });
    const res = await renameContentSectionSlug(null, fd);
    expect(res).toEqual({ ok: true, newSlug: "new-sec" });
    expect(renameSectionSlugMock).toHaveBeenCalledWith("old-sec", "new-sec", {
      changedByUserId: "00000000-0000-4000-8000-000000000001",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/app/doctor/content/sections");
    expect(revalidatePath).toHaveBeenCalledWith("/app/patient/sections/old-sec");
    expect(revalidatePath).toHaveBeenCalledWith("/app/patient/sections/new-sec");
  });

  it("rejects rename without explicit confirmation", async () => {
    const fd = formWith({
      old_slug: "old-sec",
      new_slug: "new-sec",
    });
    const res = await renameContentSectionSlug(null, fd);
    expect(res?.ok).toBe(false);
    expect(renameSectionSlugMock).not.toHaveBeenCalled();
  });
});
