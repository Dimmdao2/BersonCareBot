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
    contentPages: { upsert: upsertMock },
  }),
}));

import { saveContentPage } from "./actions";

function formWith(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

describe("saveContentPage", () => {
  beforeEach(() => {
    upsertMock.mockClear();
  });

  it("stores body_md and clears body_html when md is non-empty", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      section: "lessons",
      slug: "test-page",
      title: "T",
      summary: "S",
      body_md: "# Hello",
      sort_order: "0",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyMd: "# Hello",
        bodyHtml: "",
        slug: "test-page",
      }),
    );
  });

  it("keeps legacy body_html when body_md is empty", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      section: "lessons",
      slug: "legacy",
      title: "T",
      summary: "S",
      body_md: "",
      body_html: "<p>old</p>",
      sort_order: "0",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyMd: "",
        bodyHtml: "<p>old</p>",
      }),
    );
  });

  it("rejects body_md over max length", async () => {
    const long = "x".repeat(50001);
    const fd = formWith({
      section: "lessons",
      slug: "x",
      title: "T",
      summary: "S",
      body_md: long,
      sort_order: "0",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
