import { describe, expect, it, vi } from "vitest";
import { createMaterialRatingService } from "./service";
import type { MaterialRatingPort } from "./ports";
import type { MaterialRatingAggregate } from "./types";
import type { TreatmentProgramInstancePort, TreatmentProgramItemRefValidationPort } from "@/modules/treatment-program/ports";

describe("createMaterialRatingService putForPatient snapshot", () => {
  const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  it("uses the assigned program item as the patient read capability without probing the staff catalog", async () => {
    const assertItemRefExists = vi.fn().mockRejectedValue(new Error("permission denied"));
    const ratings: MaterialRatingPort = {
      upsertRating: vi.fn(),
      getMyRating: vi.fn().mockResolvedValue(null),
      getAggregate: vi.fn().mockResolvedValue({
        avg: null,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      } satisfies MaterialRatingAggregate),
      listAggregates: vi.fn(),
      listDoctorSummary: vi.fn(),
      getDoctorDetail: vi.fn(),
    };
    const svc = createMaterialRatingService({
      ratings,
      contentPages: { getById: vi.fn() },
      itemRefs: { assertItemRefExists } as unknown as TreatmentProgramItemRefValidationPort,
      instances: {
        getInstanceForPatient: vi.fn().mockResolvedValue({
          stages: [{
            id: "stage-1",
            sortOrder: 0,
            status: "active",
            items: [{
              id: "550e8400-e29b-41d4-a716-446655440003",
              stageId: "stage-1",
              itemType: "exercise",
              itemRefId: "550e8400-e29b-41d4-a716-446655440099",
              status: "active",
            }],
          }],
        }),
      } as unknown as TreatmentProgramInstancePort,
    });

    const out = await svc.getForPatient({
      organizationId,
      userId: "550e8400-e29b-41d4-a716-446655440001",
      targetKind: "lfk_exercise",
      targetId: "550e8400-e29b-41d4-a716-446655440099",
      programInstanceId: "550e8400-e29b-41d4-a716-446655440002",
      programStageItemId: "550e8400-e29b-41d4-a716-446655440003",
      canViewAuthOnlyContent: true,
    });

    expect(out).toEqual(expect.objectContaining({ myStars: null }));
    expect(assertItemRefExists).not.toHaveBeenCalled();
    expect(ratings.getAggregate).toHaveBeenCalledOnce();
  });

  it("returns aggregate and myStars after content_page upsert", async () => {
    const ratings: MaterialRatingPort = {
      upsertRating: vi.fn().mockResolvedValue(undefined),
      getMyRating: vi.fn().mockResolvedValue(4),
      getAggregate: vi.fn().mockResolvedValue({
        avg: 4,
        count: 1,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
      } satisfies MaterialRatingAggregate),
      listAggregates: vi.fn(),
      listDoctorSummary: vi.fn(),
      getDoctorDetail: vi.fn(),
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
      organizationId,
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
      listAggregates: vi.fn(),
      listDoctorSummary: vi.fn(),
      getDoctorDetail: vi.fn(),
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
      organizationId,
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
