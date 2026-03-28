import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({ user: { id: "doc-1" } }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: { upsert: upsertMock },
  }),
}));

import { saveContentSection } from "./actions";

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
  });

  it("saves when title and slug valid", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      slug: "new-sec",
      title: "Новый раздел",
      description: "d",
      sort_order: "1",
      is_visible: "on",
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
});
