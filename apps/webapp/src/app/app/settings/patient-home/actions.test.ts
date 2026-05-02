import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/shared/types/session";

const setBlockVisibilityMock = vi.fn();
const setBlockIconMock = vi.fn();
const addItemMock = vi.fn();
const reorderItemsMock = vi.fn();
const updateItemMock = vi.fn();
const deleteItemMock = vi.fn();
const getItemByIdMock = vi.fn();
const upsertSectionMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientHomeBlocks: {
      setBlockVisibility: setBlockVisibilityMock,
      setBlockIcon: setBlockIconMock,
      addItem: addItemMock,
      reorderItems: reorderItemsMock,
      reorderBlocks: vi.fn(),
      updateItem: updateItemMock,
      deleteItem: deleteItemMock,
      getItemById: getItemByIdMock,
      listCandidatesForBlock: vi.fn().mockResolvedValue([]),
    },
    contentSections: {
      upsert: upsertSectionMock,
    },
  }),
}));

import { getCurrentSession } from "@/modules/auth/service";
import {
  addPatientHomeItem,
  createContentSectionForPatientHomeBlock,
  deletePatientHomeItem,
  reorderPatientHomeItems,
  retargetPatientHomeItem,
  setPatientHomeBlockIcon,
  togglePatientHomeBlockVisibility,
  updatePatientHomeItemPresentation,
  updatePatientHomeItemVisibility,
} from "./actions";

function sessionWithRole(role: AppSession["user"]["role"]): AppSession {
  return {
    user: { userId: "u1", role, displayName: "Test", bindings: {} },
    issuedAt: 0,
    expiresAt: 9_999_999_999,
  };
}

describe("patient-home settings actions", () => {
  beforeEach(() => {
    setBlockVisibilityMock.mockReset();
    setBlockIconMock.mockReset();
    addItemMock.mockReset();
    reorderItemsMock.mockReset();
    updateItemMock.mockReset();
    deleteItemMock.mockReset();
    getItemByIdMock.mockReset();
    upsertSectionMock.mockReset();
    vi.mocked(getCurrentSession).mockResolvedValue(sessionWithRole("admin"));
  });

  it("toggle block visibility calls service for admin", async () => {
    setBlockVisibilityMock.mockResolvedValue(undefined);
    const res = await togglePatientHomeBlockVisibility("booking", false);
    expect(res.ok).toBe(true);
    expect(setBlockVisibilityMock).toHaveBeenCalledWith("booking", false);
  });

  it("toggle block visibility allows doctor", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(sessionWithRole("doctor"));
    setBlockVisibilityMock.mockResolvedValue(undefined);
    const res = await togglePatientHomeBlockVisibility("booking", true);
    expect(res.ok).toBe(true);
    expect(setBlockVisibilityMock).toHaveBeenCalledWith("booking", true);
  });

  it("toggle block visibility forbids client", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(sessionWithRole("client"));
    const res = await togglePatientHomeBlockVisibility("booking", false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
    expect(setBlockVisibilityMock).not.toHaveBeenCalled();
  });

  it("toggle block visibility forbids without session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    const res = await togglePatientHomeBlockVisibility("booking", false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
    expect(setBlockVisibilityMock).not.toHaveBeenCalled();
  });

  it("setPatientHomeBlockIcon calls service for whitelist block with media URL", async () => {
    setBlockIconMock.mockResolvedValue(undefined);
    const res = await setPatientHomeBlockIcon("booking", "/api/media/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(res.ok).toBe(true);
    expect(setBlockIconMock).toHaveBeenCalledWith("booking", "/api/media/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  });

  it("setPatientHomeBlockIcon rejects non-whitelist block", async () => {
    const res = await setPatientHomeBlockIcon("daily_warmup", "/api/media/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("block_icon_not_supported");
    expect(setBlockIconMock).not.toHaveBeenCalled();
  });

  it("updatePatientHomeItemPresentation updates useful_post badge label", async () => {
    getItemByIdMock.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440099",
      blockCode: "useful_post",
      targetType: "content_page",
      targetRef: "page",
      titleOverride: null,
      subtitleOverride: null,
      imageUrlOverride: null,
      badgeLabel: null,
      isVisible: true,
      sortOrder: 0,
    });
    updateItemMock.mockResolvedValue(undefined);
    const res = await updatePatientHomeItemPresentation({
      itemId: "550e8400-e29b-41d4-a716-446655440099",
      badgeLabel: "Новый пост",
    });
    expect(res.ok).toBe(true);
    expect(updateItemMock).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440099", { badgeLabel: "Новый пост" });
  });

  it("updatePatientHomeItemPresentation updates useful_post title visibility", async () => {
    getItemByIdMock.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440099",
      blockCode: "useful_post",
      targetType: "content_page",
      targetRef: "page",
      titleOverride: null,
      subtitleOverride: null,
      imageUrlOverride: null,
      badgeLabel: null,
      showTitle: true,
      isVisible: true,
      sortOrder: 0,
    });
    updateItemMock.mockResolvedValue(undefined);
    const res = await updatePatientHomeItemPresentation({
      itemId: "550e8400-e29b-41d4-a716-446655440099",
      showTitle: false,
    });
    expect(res.ok).toBe(true);
    expect(updateItemMock).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440099", { showTitle: false });
  });

  it("updatePatientHomeItemPresentation rejects non-useful_post items", async () => {
    getItemByIdMock.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440099",
      blockCode: "daily_warmup",
      targetType: "content_page",
      targetRef: "page",
      titleOverride: null,
      subtitleOverride: null,
      imageUrlOverride: null,
      badgeLabel: null,
      isVisible: true,
      sortOrder: 0,
    });
    const res = await updatePatientHomeItemPresentation({
      itemId: "550e8400-e29b-41d4-a716-446655440099",
      badgeLabel: "Новый пост",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_item_for_badge");
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("setPatientHomeBlockIcon rejects URL outside media policy", async () => {
    const res = await setPatientHomeBlockIcon("booking", "/static/icon.png");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("библиотеки");
    expect(setBlockIconMock).not.toHaveBeenCalled();
  });

  it("setPatientHomeBlockIcon forbids client", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(sessionWithRole("client"));
    const res = await setPatientHomeBlockIcon("booking", null);
    expect(res.ok).toBe(false);
    expect(setBlockIconMock).not.toHaveBeenCalled();
  });

  it("setPatientHomeBlockIcon passes null to clear icon", async () => {
    setBlockIconMock.mockResolvedValue(undefined);
    const res = await setPatientHomeBlockIcon("plan", null);
    expect(res.ok).toBe(true);
    expect(setBlockIconMock).toHaveBeenCalledWith("plan", null);
  });

  it("rejects invalid block code on add item", async () => {
    const res = await addPatientHomeItem({
      blockCode: "bad-code",
      targetType: "content_page",
      targetRef: "slug",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("invalid_block_code");
  });

  it("rejects invalid target type on add item", async () => {
    const res = await addPatientHomeItem({
      blockCode: "daily_warmup",
      targetType: "bad_target",
      targetRef: "slug",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("invalid_target_type");
  });

  it("reorder items validates block code", async () => {
    const res = await reorderPatientHomeItems("bad-code", ["550e8400-e29b-41d4-a716-446655440000"]);
    expect(res.ok).toBe(false);
    expect(reorderItemsMock).not.toHaveBeenCalled();
  });

  it("reorder items rejects invalid item id", async () => {
    const res = await reorderPatientHomeItems("sos", ["not-a-uuid"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_item_id");
    expect(reorderItemsMock).not.toHaveBeenCalled();
  });

  it("reorder items rejects empty list", async () => {
    const res = await reorderPatientHomeItems("sos", []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_item_id");
    expect(reorderItemsMock).not.toHaveBeenCalled();
  });

  it("update visibility rejects invalid item id", async () => {
    const res = await updatePatientHomeItemVisibility("bad-id", true);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_item_id");
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("delete item rejects invalid item id", async () => {
    const res = await deletePatientHomeItem("not-a-uuid");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_item_id");
    expect(deleteItemMock).not.toHaveBeenCalled();
  });

  it("retarget item calls updateItem", async () => {
    updateItemMock.mockResolvedValue(undefined);
    const res = await retargetPatientHomeItem({
      itemId: "550e8400-e29b-41d4-a716-446655440000",
      targetType: "content_page",
      targetRef: "new-slug",
    });
    expect(res.ok).toBe(true);
    expect(updateItemMock).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", {
      targetType: "content_page",
      targetRef: "new-slug",
    });
  });

  it("retarget rejects empty target ref", async () => {
    const res = await retargetPatientHomeItem({
      itemId: "550e8400-e29b-41d4-a716-446655440000",
      targetType: "content_page",
      targetRef: "   ",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("empty_target_ref");
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("retarget rejects empty item id", async () => {
    const res = await retargetPatientHomeItem({
      itemId: "",
      targetType: "content_page",
      targetRef: "slug",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("empty_item_id");
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("retarget rejects invalid item id (not UUID)", async () => {
    const res = await retargetPatientHomeItem({
      itemId: "not-a-uuid",
      targetType: "content_page",
      targetRef: "slug",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_item_id");
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("retarget rejects invalid target type", async () => {
    const res = await retargetPatientHomeItem({
      itemId: "550e8400-e29b-41d4-a716-446655440000",
      targetType: "bad_target",
      targetRef: "slug",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_target_type");
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  describe("createContentSectionForPatientHomeBlock", () => {
    it("forbids client", async () => {
      vi.mocked(getCurrentSession).mockResolvedValue(sessionWithRole("client"));
      const res = await createContentSectionForPatientHomeBlock({
        blockCode: "situations",
        title: "T",
        slug: "ok-slug",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("forbidden");
      expect(upsertSectionMock).not.toHaveBeenCalled();
    });

    it("rejects invalid block code", async () => {
      const res = await createContentSectionForPatientHomeBlock({
        blockCode: "nope",
        title: "T",
        slug: "ok-slug",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("invalid_block_code");
      expect(upsertSectionMock).not.toHaveBeenCalled();
    });

    it("rejects block without content_section targets", async () => {
      const res = await createContentSectionForPatientHomeBlock({
        blockCode: "daily_warmup",
        title: "T",
        slug: "ok-slug",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("invalid_target_type_for_block");
      expect(upsertSectionMock).not.toHaveBeenCalled();
    });

    it("rejects inline section for subscription_carousel", async () => {
      const res = await createContentSectionForPatientHomeBlock({
        blockCode: "subscription_carousel",
        title: "T",
        slug: "ok-slug",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("inline_section_not_supported_for_block");
      expect(upsertSectionMock).not.toHaveBeenCalled();
    });

    it("rejects invalid slug (only dashes)", async () => {
      const res = await createContentSectionForPatientHomeBlock({
        blockCode: "situations",
        title: "T",
        slug: "---",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("дефис");
      expect(upsertSectionMock).not.toHaveBeenCalled();
    });

    it("rejects invalid cover image URL", async () => {
      const res = await createContentSectionForPatientHomeBlock({
        blockCode: "situations",
        title: "T",
        slug: "valid-slug",
        coverImageUrl: "not-a-valid-library-url",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("Обложка");
      expect(upsertSectionMock).not.toHaveBeenCalled();
    });

    it("upserts section then adds patient home item", async () => {
      upsertSectionMock.mockResolvedValue(undefined);
      addItemMock.mockResolvedValue("550e8400-e29b-41d4-a716-446655440099");
      const res = await createContentSectionForPatientHomeBlock({
        blockCode: "situations",
        title: "Раздел",
        slug: "new-sec",
        description: "Описание",
        sortOrder: 2,
        isVisible: false,
        requiresAuth: true,
        iconImageUrl: null,
        coverImageUrl: null,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.itemId).toBe("550e8400-e29b-41d4-a716-446655440099");
      expect(res.sectionSlug).toBe("new-sec");
      expect(upsertSectionMock).toHaveBeenCalledTimes(1);
      expect(addItemMock).toHaveBeenCalledTimes(1);
      expect(upsertSectionMock.mock.invocationCallOrder[0]!).toBeLessThan(addItemMock.mock.invocationCallOrder[0]!);
      expect(upsertSectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "new-sec",
          title: "Раздел",
          description: "Описание",
          sortOrder: 2,
          isVisible: false,
          requiresAuth: true,
          coverImageUrl: null,
          iconImageUrl: null,
          kind: "system",
          systemParentCode: "situations",
        }),
      );
      expect(addItemMock).toHaveBeenCalledWith({
        blockCode: "situations",
        targetType: "content_section",
        targetRef: "new-sec",
        isVisible: true,
      });
    });
  });
});
