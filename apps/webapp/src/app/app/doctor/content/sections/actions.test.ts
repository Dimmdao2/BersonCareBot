import { beforeEach, describe, expect, it, vi } from "vitest";

const requireEntitlementForActionMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForAction: requireEntitlementForActionMock,
}));

const upsertMock = vi.fn();
const updateMock = vi.fn();
const deleteSectionWithPageReassignMock = vi.fn();
const renameSectionSlugMock = vi.fn();
const getBySlugMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const { requireDoctorWorkspaceContextMock, withDoctorWorkspacePrincipalMock } = vi.hoisted(() => ({
  requireDoctorWorkspaceContextMock: vi.fn(),
  withDoctorWorkspacePrincipalMock: vi.fn((_: unknown, fn: () => unknown) => fn()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: requireDoctorWorkspaceContextMock,
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: {
      upsert: upsertMock,
      update: updateMock,
      deleteSectionWithPageReassign: deleteSectionWithPageReassignMock,
      renameSectionSlug: renameSectionSlugMock,
      getBySlug: getBySlugMock,
    },
  }),
}));

import { revalidatePath } from "next/cache";
import {
  attachArticleSectionToSystemFolder,
  deleteContentSection,
  renameContentSectionSlug,
  saveContentSection,
} from "./actions";

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
    updateMock.mockClear();
    deleteSectionWithPageReassignMock.mockReset();
    renameSectionSlugMock.mockReset();
    getBySlugMock.mockReset();
    getBySlugMock.mockResolvedValue(null);
    requireDoctorWorkspaceContextMock.mockReset();
    requireDoctorWorkspaceContextMock.mockResolvedValue({
      organizationId: "org-1",
      session: { user: { userId: "00000000-0000-4000-8000-000000000001", role: "doctor" } },
    });
    requireEntitlementForActionMock.mockReset();
    requireEntitlementForActionMock.mockResolvedValue({ ok: true });
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
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
        kind: "article",
        systemParentCode: null,
      }),
    );
  });

  it("saves taxonomy from placement field", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      slug: "sub-sos",
      title: "Подраздел SOS",
      description: "",
      sort_order: "0",
      placement: "sos",
      cover_image_url: "",
      icon_image_url: "",
    });
    const res = await saveContentSection(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "sub-sos",
        kind: "system",
        systemParentCode: "sos",
      }),
    );
  });

  it("rejects reserved help slug on create", async () => {
    const fd = formWith({
      slug: "help",
      title: "Клон справки",
      description: "",
      sort_order: "0",
      cover_image_url: "",
      icon_image_url: "",
    });
    const res = await saveContentSection(null, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/зарезервирован/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects reserved slug on create", async () => {
    const fd = formWith({
      slug: "warmups",
      title: "Клон",
      description: "",
      sort_order: "0",
      cover_image_url: "",
      icon_image_url: "",
    });
    const res = await saveContentSection(null, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/зарезервирован/i);
    expect(upsertMock).not.toHaveBeenCalled();
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

  it("rejects rename for immutable built-in slug", async () => {
    const fd = formWith({
      old_slug: "warmups",
      new_slug: "warmups-2",
      confirm_rename: "on",
    });
    const res = await renameContentSectionSlug(null, fd);
    expect(res?.ok).toBe(false);
    expect(renameSectionSlugMock).not.toHaveBeenCalled();
  });

  it("rejects rename from CMS unassigned bucket slug", async () => {
    const fd = formWith({
      old_slug: "_cms_unassigned",
      new_slug: "other-sec",
      confirm_rename: "on",
    });
    const res = await renameContentSectionSlug(null, fd);
    expect(res?.ok).toBe(false);
    expect(renameSectionSlugMock).not.toHaveBeenCalled();
  });

  it("rejects rename target CMS unassigned bucket slug", async () => {
    const fd = formWith({
      old_slug: "old-sec",
      new_slug: "_cms_unassigned",
      confirm_rename: "on",
    });
    const res = await renameContentSectionSlug(null, fd);
    expect(res?.ok).toBe(false);
    expect(renameSectionSlugMock).not.toHaveBeenCalled();
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

  it.each([
    ["save", () => saveContentSection(null, formWith({ slug: "new", title: "New" })), upsertMock],
    ["attach", () => attachArticleSectionToSystemFolder(null, formWith({ section_slug: "new", system_parent_code: "sos" })), updateMock],
    ["rename", () => renameContentSectionSlug(null, formWith({ old_slug: "old", new_slug: "new", confirm_rename: "on" })), renameSectionSlugMock],
    ["delete", () => deleteContentSection(null, formWith({ section_slug: "old", confirm_delete: "on" })), deleteSectionWithPageReassignMock],
  ])("returns typed cms_pages denial before %s service", async (_name, invoke, service) => {
    requireEntitlementForActionMock.mockResolvedValueOnce({
      ok: false,
      mechanic: "cms_pages",
      reason: "entitlement_required",
    });

    const result = await invoke();

    expect(result).toMatchObject({ ok: false, error: "entitlement_required" });
    expect(service).not.toHaveBeenCalled();
    expect(requireDoctorWorkspaceContextMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireEntitlementForActionMock.mock.invocationCallOrder[0]!,
    );
  });
});

describe("deleteContentSection", () => {
  beforeEach(() => {
    deleteSectionWithPageReassignMock.mockReset();
    vi.mocked(revalidatePath).mockClear();
  });

  it("deletes section through selected workspace principal", async () => {
    deleteSectionWithPageReassignMock.mockResolvedValue({ ok: true, movedPageCount: 2 });
    const fd = formWith({ section_slug: "old-sec", confirm_delete: "on" });

    const res = await deleteContentSection(null, fd);

    expect(res).toEqual({ ok: true, movedPageCount: 2 });
    expect(deleteSectionWithPageReassignMock).toHaveBeenCalledWith("old-sec");
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      expect.any(Function),
    );
  });
});

describe("attachArticleSectionToSystemFolder", () => {
  beforeEach(() => {
    updateMock.mockClear();
    getBySlugMock.mockReset();
    vi.mocked(revalidatePath).mockClear();
  });

  it("moves article section into system folder via update", async () => {
    getBySlugMock.mockResolvedValue({
      slug: "antistress",
      kind: "article",
      systemParentCode: null,
    });
    updateMock.mockResolvedValue(undefined);
    const fd = new FormData();
    fd.set("section_slug", "antistress");
    fd.set("system_parent_code", "situations");
    const res = await attachArticleSectionToSystemFolder(null, fd);
    expect(res.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith("antistress", {
      kind: "system",
      systemParentCode: "situations",
    });
  });

  it("rejects when section is not article", async () => {
    getBySlugMock.mockResolvedValue({
      slug: "warmups",
      kind: "system",
      systemParentCode: "warmups",
    });
    const fd = new FormData();
    fd.set("section_slug", "warmups");
    fd.set("system_parent_code", "situations");
    const res = await attachArticleSectionToSystemFolder(null, fd);
    expect(res.ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects immutable slug", async () => {
    const fd = new FormData();
    fd.set("section_slug", "warmups");
    fd.set("system_parent_code", "situations");
    const res = await attachArticleSectionToSystemFolder(null, fd);
    expect(res.ok).toBe(false);
    expect(getBySlugMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
