import { beforeEach, describe, expect, it, vi } from "vitest";

const setBlockVisibilityMock = vi.fn();
const addItemMock = vi.fn();
const reorderItemsMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: vi.fn().mockResolvedValue({
    user: { role: "admin" },
  }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientHomeBlocks: {
      setBlockVisibility: setBlockVisibilityMock,
      addItem: addItemMock,
      reorderItems: reorderItemsMock,
      reorderBlocks: vi.fn(),
      updateItem: vi.fn(),
      deleteItem: vi.fn(),
      listCandidatesForBlock: vi.fn().mockResolvedValue([]),
    },
  }),
}));

import {
  addPatientHomeItem,
  reorderPatientHomeItems,
  togglePatientHomeBlockVisibility,
} from "./actions";

describe("patient-home settings actions", () => {
  beforeEach(() => {
    setBlockVisibilityMock.mockReset();
    addItemMock.mockReset();
    reorderItemsMock.mockReset();
  });

  it("toggle block visibility calls service", async () => {
    setBlockVisibilityMock.mockResolvedValue(undefined);
    const res = await togglePatientHomeBlockVisibility("booking", false);
    expect(res.ok).toBe(true);
    expect(setBlockVisibilityMock).toHaveBeenCalledWith("booking", false);
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
    const res = await reorderPatientHomeItems("bad-code", ["x"]);
    expect(res.ok).toBe(false);
    expect(reorderItemsMock).not.toHaveBeenCalled();
  });
});
