import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "@/shared/types/session";

const setBlockVisibilityMock = vi.fn();
const addItemMock = vi.fn();
const reorderItemsMock = vi.fn();
const updateItemMock = vi.fn();
const deleteItemMock = vi.fn();

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
      addItem: addItemMock,
      reorderItems: reorderItemsMock,
      reorderBlocks: vi.fn(),
      updateItem: updateItemMock,
      deleteItem: deleteItemMock,
      listCandidatesForBlock: vi.fn().mockResolvedValue([]),
    },
  }),
}));

import { getCurrentSession } from "@/modules/auth/service";
import {
  addPatientHomeItem,
  deletePatientHomeItem,
  reorderPatientHomeItems,
  retargetPatientHomeItem,
  togglePatientHomeBlockVisibility,
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
    addItemMock.mockReset();
    reorderItemsMock.mockReset();
    updateItemMock.mockReset();
    deleteItemMock.mockReset();
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
});
