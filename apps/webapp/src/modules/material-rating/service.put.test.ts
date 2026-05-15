import { describe, expect, it, vi } from "vitest";
import { createMaterialRatingService } from "./service";
import type { MaterialRatingPort } from "./ports";
import type { MaterialRatingAggregate } from "./types";
import type { TreatmentProgramInstancePort, TreatmentProgramItemRefValidationPort } from "@/modules/treatment-program/ports";

describe("createMaterialRatingService putForPatient snapshot", () => {
  it("returns aggregate and myStars after content_page upsert", async () => {
    const ratings: MaterialRatingPort = {
      upsertRating: vi.fn().mockResolvedValue(undefined),
      getMyRating: vi.fn().mockResolvedValue(4),
      getAggregate: vi.fn().mockResolvedValue({
        avg: 4,
        count: 1,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
      } satisfies MaterialRatingAggregate),
      listDoctorSummary: vi.fn(),
    };
    const svc = createMaterialRatingService({
      ratings,
      contentPages: {
        getById: vi.fn().mockResolvedValue({
          deletedAt: null,
          archivedAt: null,
          isPublished: true,
          requiresAuth: false,
        }),
      },
      itemRefs: { assertItemRefExists: vi.fn() } as unknown as TreatmentProgramItemRefValidationPort,
      instances: { getInstanceForPatient: vi.fn() } as unknown as TreatmentProgramInstancePort,
    });
    const out = await svc.putForPatient({
      userId: "u1",
      stars: 4,
      targetKind: "content_page",
      targetId: "550e8400-e29b-41d4-a716-446655440099",
      canViewAuthOnlyContent: true,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.myStars).toBe(4);
      expect(out.aggregate.count).toBe(1);
    }
    expect(ratings.getAggregate).toHaveBeenCalled();
    expect(ratings.getMyRating).toHaveBeenCalled();
  });

  it("rejects content_page when only one of programInstanceId / programStageItemId is set", async () => {
    const ratings: MaterialRatingPort = {
      upsertRating: vi.fn(),
      getMyRating: vi.fn(),
      getAggregate: vi.fn(),
      listDoctorSummary: vi.fn(),
    };
    const svc = createMaterialRatingService({
      ratings,
      contentPages: {
        getById: vi.fn().mockResolvedValue({
          deletedAt: null,
          archivedAt: null,
          isPublished: true,
          requiresAuth: false,
        }),
      },
      itemRefs: { assertItemRefExists: vi.fn() } as unknown as TreatmentProgramItemRefValidationPort,
      instances: { getInstanceForPatient: vi.fn() } as unknown as TreatmentProgramInstancePort,
    });
    const out = await svc.putForPatient({
      userId: "u1",
      stars: 4,
      targetKind: "content_page",
      targetId: "550e8400-e29b-41d4-a716-446655440099",
      canViewAuthOnlyContent: true,
      programInstanceId: "660e8400-e29b-41d4-a716-446655440088",
      programStageItemId: null,
    });
    expect(out).toEqual({ ok: false, code: "missing_program_context" });
    expect(ratings.upsertRating).not.toHaveBeenCalled();
  });
});
