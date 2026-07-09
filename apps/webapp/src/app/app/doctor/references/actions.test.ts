import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const {
  revalidatePathMock,
  saveCatalogMock,
  insertItemStaffMock,
  updateItemMock,
  softDeleteItemMock,
  requireDoctorAccessMock,
  requireDoctorWorkspaceContextMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  saveCatalogMock: vi.fn(),
  insertItemStaffMock: vi.fn(),
  updateItemMock: vi.fn(),
  softDeleteItemMock: vi.fn(),
  requireDoctorAccessMock: vi.fn(),
  requireDoctorWorkspaceContextMock: vi.fn(),
}));

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: requireDoctorAccessMock,
  requireDoctorWorkspaceContext: requireDoctorWorkspaceContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    references: {
      saveCatalog: saveCatalogMock,
      insertItemStaff: insertItemStaffMock,
      updateItem: updateItemMock,
      softDeleteItem: softDeleteItemMock,
    },
  }),
}));

import {
  addReferenceItem,
  saveReferenceCatalog,
  saveReferenceItem,
  softDeleteReferenceItem,
  toggleReferenceItem,
} from "./actions";

function workspaceContext() {
  return {
    session: { user: { userId: "11111111-1111-4111-8111-111111111111" } },
    organizationId: ORGANIZATION_ID,
    membershipId: "33333333-3333-4333-8333-333333333333",
    membershipRole: "doctor",
    specialistId: "44444444-4444-4444-8444-444444444444",
    canManageOrganization: false,
    canManageAllSpecialists: false,
  };
}

describe("saveReferenceCatalog", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    saveCatalogMock.mockReset();
    saveCatalogMock.mockResolvedValue(undefined);
    insertItemStaffMock.mockReset();
    insertItemStaffMock.mockResolvedValue(undefined);
    updateItemMock.mockReset();
    updateItemMock.mockResolvedValue(undefined);
    softDeleteItemMock.mockReset();
    softDeleteItemMock.mockResolvedValue(undefined);
    requireDoctorAccessMock.mockReset();
    requireDoctorWorkspaceContextMock.mockReset();
    requireDoctorWorkspaceContextMock.mockResolvedValue(workspaceContext());
  });

  it("runs batch save under the selected organization principal and revalidates after it clears", async () => {
    const events: string[] = [];
    saveCatalogMock.mockImplementation(async () => {
      events.push("save");
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });
    revalidatePathMock.mockImplementation(() => {
      events.push("revalidate");
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
    });

    const result = await saveReferenceCatalog({
      categoryCode: " body_region ",
      updates: [
        {
          id: " item-1 ",
          code: " neck ",
          title: " Шея ",
          sortOrder: 1,
          isActive: true,
        },
      ],
      additions: [
        {
          code: " shoulder ",
          title: " Плечо ",
          sortOrder: 2,
        },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(requireDoctorAccessMock).not.toHaveBeenCalled();
    expect(requireDoctorWorkspaceContextMock).toHaveBeenCalledTimes(1);
    expect(saveCatalogMock).toHaveBeenCalledWith("body_region", {
      updates: [
        {
          id: "item-1",
          code: "neck",
          title: "Шея",
          sortOrder: 1,
          isActive: true,
        },
      ],
      additions: [
        {
          code: "shoulder",
          title: "Плечо",
          sortOrder: 2,
        },
      ],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/references");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/references/body_region");
    expect(events).toEqual(["save", "revalidate", "revalidate"]);
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("returns invalid category before save and without entering principal context", async () => {
    const result = await saveReferenceCatalog({
      categoryCode: " ",
      updates: [],
      additions: [],
    });

    expect(result).toEqual({ ok: false, code: "category_required" });
    expect(saveCatalogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("returns invalid update payload before save and without entering principal context", async () => {
    const result = await saveReferenceCatalog({
      categoryCode: "body_region",
      updates: [
        {
          id: "item-1",
          code: "1bad",
          title: "Шея",
          sortOrder: 1,
          isActive: true,
        },
      ],
      additions: [],
    });

    expect(result).toEqual({ ok: false, code: "invalid_update_payload", invalidValue: "1bad" });
    expect(saveCatalogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("returns invalid addition payload before save and without entering principal context", async () => {
    const result = await saveReferenceCatalog({
      categoryCode: "body_region",
      updates: [],
      additions: [
        {
          code: "bad-code",
          title: "Новое",
          sortOrder: 2,
        },
      ],
    });

    expect(result).toEqual({ ok: false, code: "invalid_add_payload", invalidValue: "bad-code" });
    expect(saveCatalogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});

describe("single reference item actions", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    saveCatalogMock.mockReset();
    saveCatalogMock.mockResolvedValue(undefined);
    insertItemStaffMock.mockReset();
    insertItemStaffMock.mockResolvedValue(undefined);
    updateItemMock.mockReset();
    updateItemMock.mockResolvedValue(undefined);
    softDeleteItemMock.mockReset();
    softDeleteItemMock.mockResolvedValue(undefined);
    requireDoctorAccessMock.mockReset();
    requireDoctorWorkspaceContextMock.mockReset();
    requireDoctorWorkspaceContextMock.mockResolvedValue(workspaceContext());
  });

  it("adds an item under the selected organization principal and revalidates after it clears", async () => {
    const events: string[] = [];
    insertItemStaffMock.mockImplementation(async () => {
      events.push("insert");
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });
    revalidatePathMock.mockImplementation(() => {
      events.push("revalidate");
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
    });
    const formData = new FormData();
    formData.set("categoryCode", " body_region ");
    formData.set("code", " neck ");
    formData.set("title", " Шея ");
    formData.set("sortOrder", "7");

    await addReferenceItem(formData);

    expect(requireDoctorAccessMock).not.toHaveBeenCalled();
    expect(requireDoctorWorkspaceContextMock).toHaveBeenCalledTimes(1);
    expect(insertItemStaffMock).toHaveBeenCalledWith({
      categoryCode: "body_region",
      code: "neck",
      title: "Шея",
      sortOrder: 7,
    });
    expect(events).toEqual(["insert", "revalidate", "revalidate"]);
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("saves item fields under the selected organization principal", async () => {
    updateItemMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });
    const formData = new FormData();
    formData.set("categoryCode", "body_region");
    formData.set("itemId", "item-1");
    formData.set("title", "Шея");
    formData.set("sortOrder", "3");

    await saveReferenceItem(formData);

    expect(requireDoctorAccessMock).not.toHaveBeenCalled();
    expect(updateItemMock).toHaveBeenCalledWith("item-1", {
      title: "Шея",
      sortOrder: 3,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/references/body_region");
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("toggles item activity under the selected organization principal", async () => {
    updateItemMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });
    const formData = new FormData();
    formData.set("categoryCode", "body_region");
    formData.set("itemId", "item-1");
    formData.set("nextActive", "false");

    await toggleReferenceItem(formData);

    expect(requireDoctorAccessMock).not.toHaveBeenCalled();
    expect(updateItemMock).toHaveBeenCalledWith("item-1", { isActive: false });
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("soft-deletes an item under the selected organization principal", async () => {
    softDeleteItemMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });
    const formData = new FormData();
    formData.set("categoryCode", "body_region");
    formData.set("itemId", "item-1");

    const result = await softDeleteReferenceItem(formData);

    expect(result).toEqual({ ok: true });
    expect(requireDoctorAccessMock).not.toHaveBeenCalled();
    expect(softDeleteItemMock).toHaveBeenCalledWith("item-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/references/body_region");
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});
