import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());
const getBySlugMock = vi.hoisted(() => vi.fn());
const upsertMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({ user: { id: "doc-1" } }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: {
      getBySlug: getBySlugMock,
      upsert: upsertMock,
    },
  }),
}));

import {
  createContentSectionForPatientHomeBlock,
  reorderPatientHomeBlockItemsAction,
} from "@/app/app/settings/patient-home/actions";

describe("patient-home settings actions", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    getBySlugMock.mockReset();
    upsertMock.mockReset();
  });

  describe("Phase 2 stubs", () => {
    it("reorderPatientHomeBlockItemsAction returns ok and revalidates doctor patient-home", async () => {
      const r = await reorderPatientHomeBlockItemsAction("situations", ["a", "b"]);
      expect(r).toEqual({ ok: true });
      expect(revalidatePath).toHaveBeenCalled();
    });
  });

  describe("createContentSectionForPatientHomeBlock (Phase 3)", () => {
    it("creates section and returns item for situations", async () => {
      getBySlugMock.mockResolvedValue(null);
      upsertMock.mockResolvedValue("uuid-new");
      const r = await createContentSectionForPatientHomeBlock({
        blockCode: "situations",
        title: "Дом",
        slug: "home-test",
        description: "",
        sortOrder: 2,
        isVisible: true,
        requiresAuth: false,
      });
      expect(r).toEqual({
        ok: true,
        item: {
          id: "uuid-new",
          targetType: "content_section",
          targetRef: "home-test",
          title: "Дом",
          isVisible: true,
          resolved: true,
        },
      });
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "home-test",
          title: "Дом",
          sortOrder: 2,
          isVisible: true,
          requiresAuth: false,
        }),
      );
      expect(revalidatePath.mock.calls.length).toBeGreaterThan(0);
    });

    it("rejects duplicate slug", async () => {
      getBySlugMock.mockResolvedValue({
        id: "1",
        slug: "x",
        title: "t",
        description: "",
        sortOrder: 0,
        isVisible: true,
        requiresAuth: false,
      });
      const r = await createContentSectionForPatientHomeBlock({
        blockCode: "situations",
        title: "T",
        slug: "x",
        isVisible: true,
        requiresAuth: false,
      });
      expect(r).toEqual({ ok: false, error: "Раздел с таким slug уже существует" });
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it("rejects invalid slug", async () => {
      getBySlugMock.mockResolvedValue(null);
      const r = await createContentSectionForPatientHomeBlock({
        blockCode: "situations",
        title: "T",
        slug: "BAD",
        isVisible: true,
        requiresAuth: false,
      });
      expect(r.ok).toBe(false);
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it("rejects invalid optional media URL", async () => {
      const r = await createContentSectionForPatientHomeBlock({
        blockCode: "situations",
        title: "T",
        slug: "ok-slug",
        isVisible: true,
        requiresAuth: false,
        iconImageUrl: "not-a-valid-url",
      });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.error).toContain("иконки");
      expect(getBySlugMock).not.toHaveBeenCalled();
    });

    it("rejects block without content_section support", async () => {
      const r = await createContentSectionForPatientHomeBlock({
        blockCode: "courses",
        title: "T",
        slug: "ok-slug",
        isVisible: true,
        requiresAuth: false,
      });
      expect(r).toEqual({ ok: false, error: "Для этого блока нельзя создать раздел из редактора" });
      expect(getBySlugMock).not.toHaveBeenCalled();
    });
  });
});
