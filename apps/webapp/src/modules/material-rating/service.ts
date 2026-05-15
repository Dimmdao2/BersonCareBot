import type { MaterialRatingPort } from "./ports";
import type { MaterialRatingAggregate, MaterialRatingTargetKind } from "./types";
import { MaterialRatingAccessError } from "./types";
import type {
  TreatmentProgramInstancePort,
  TreatmentProgramItemRefValidationPort,
} from "@/modules/treatment-program/ports";
import { isInstanceStageItemActiveForPatient, isStageZero } from "@/modules/treatment-program/stage-semantics";
import { treatmentProgramItemToRatingTarget } from "./mapProgramItemToTarget";

/** Снимок CMS-страницы для правил оценки (без импорта из `infra/repos`). */
export type MaterialRatingContentPageSnapshot = {
  deletedAt: string | null;
  archivedAt: string | null;
  isPublished: boolean;
  requiresAuth: boolean;
};

export type MaterialRatingContentPagesPort = {
  getById(id: string): Promise<MaterialRatingContentPageSnapshot | null>;
};

export function createMaterialRatingService(deps: {
  ratings: MaterialRatingPort;
  contentPages: MaterialRatingContentPagesPort;
  itemRefs: TreatmentProgramItemRefValidationPort;
  instances: TreatmentProgramInstancePort;
}) {
  async function loadContentPageOrThrow(targetId: string): Promise<MaterialRatingContentPageSnapshot> {
    const row = await deps.contentPages.getById(targetId);
    if (!row || row.deletedAt) {
      throw new MaterialRatingAccessError("not_found");
    }
    return row;
  }

  /** Пациентский GET: как у каталога / материала по slug — только опубликованное, не в архиве. */
  function assertContentPageReadableForPatientGet(row: MaterialRatingContentPageSnapshot, canViewAuthOnly: boolean) {
    if (!row.isPublished || row.archivedAt) {
      throw new MaterialRatingAccessError("not_found");
    }
    if (row.requiresAuth && !canViewAuthOnly) {
      throw new MaterialRatingAccessError("not_found");
    }
  }

  /** Пациентский PUT: те же ограничения видимости; при `requires_auth` без tier — 403. */
  function assertContentPageMutableForPatientPut(row: MaterialRatingContentPageSnapshot, canViewAuthOnly: boolean) {
    if (!row.isPublished || row.archivedAt) {
      throw new MaterialRatingAccessError("not_found");
    }
    if (row.requiresAuth && !canViewAuthOnly) {
      throw new MaterialRatingAccessError("forbidden");
    }
  }

  async function assertTargetExistsNonContent(targetKind: Exclude<MaterialRatingTargetKind, "content_page">, targetId: string) {
    if (targetKind === "lfk_exercise") {
      await deps.itemRefs.assertItemRefExists("exercise", targetId);
      return;
    }
    await deps.itemRefs.assertItemRefExists("lfk_complex", targetId);
  }

  async function assertProgramStageItemMatchesTarget(input: {
    userId: string;
    instanceId: string;
    stageItemId: string;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
  }): Promise<{ ok: true } | { ok: false; code: "not_found" | "forbidden" }> {
    const detail = await deps.instances.getInstanceForPatient(input.userId, input.instanceId);
    if (!detail) return { ok: false, code: "not_found" };
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === input.stageItemId);
    if (!item) return { ok: false, code: "not_found" };
    const stage = detail.stages.find((s) => s.id === item.stageId);
    if (!stage) return { ok: false, code: "not_found" };
    if (!isInstanceStageItemActiveForPatient(item)) return { ok: false, code: "forbidden" };
    if (!isStageZero(stage) && (stage.status === "locked" || stage.status === "skipped")) {
      return { ok: false, code: "forbidden" };
    }
    const mapped = treatmentProgramItemToRatingTarget(item.itemType, item.itemRefId);
    if (!mapped.kind || mapped.targetId !== input.targetId || mapped.kind !== input.targetKind) {
      return { ok: false, code: "forbidden" };
    }
    return { ok: true };
  }

  return {
    async getPublicAggregate(input: { targetKind: MaterialRatingTargetKind; targetId: string }) {
      if (input.targetKind === "content_page") {
        await loadContentPageOrThrow(input.targetId);
      } else {
        try {
          await assertTargetExistsNonContent(input.targetKind, input.targetId);
        } catch {
          throw new MaterialRatingAccessError("not_found");
        }
      }
      return deps.ratings.getAggregate(input);
    },

    async getForPatient(input: {
      userId: string | null;
      targetKind: MaterialRatingTargetKind;
      targetId: string;
      programInstanceId?: string | null;
      programStageItemId?: string | null;
      /** Tier пациента для `requires_auth` страниц; для гостя — false. */
      canViewAuthOnlyContent: boolean;
    }): Promise<{ aggregate: MaterialRatingAggregate; myStars: number | null }> {
      if (input.targetKind === "content_page") {
        const row = await loadContentPageOrThrow(input.targetId);
        assertContentPageReadableForPatientGet(row, input.canViewAuthOnlyContent);
      } else {
        try {
          await assertTargetExistsNonContent(input.targetKind, input.targetId);
        } catch {
          throw new MaterialRatingAccessError("not_found");
        }
      }

      const aggregate = await deps.ratings.getAggregate({
        targetKind: input.targetKind,
        targetId: input.targetId,
      });

      if (!input.userId) {
        return { aggregate, myStars: null };
      }
      if (input.targetKind !== "content_page" && (!input.programInstanceId || !input.programStageItemId)) {
        return { aggregate, myStars: null };
      }
      if (input.targetKind !== "content_page") {
        const gate = await assertProgramStageItemMatchesTarget({
          userId: input.userId,
          instanceId: input.programInstanceId!,
          stageItemId: input.programStageItemId!,
          targetKind: input.targetKind,
          targetId: input.targetId,
        });
        if (!gate.ok) {
          return { aggregate, myStars: null };
        }
      }
      const myStars = await deps.ratings.getMyRating({
        userId: input.userId,
        targetKind: input.targetKind,
        targetId: input.targetId,
      });
      return { aggregate, myStars };
    },

    async putForPatient(input: {
      userId: string;
      stars: number;
      targetKind: MaterialRatingTargetKind;
      targetId: string;
      programInstanceId?: string | null;
      programStageItemId?: string | null;
      canViewAuthOnlyContent: boolean;
    }): Promise<
      | { ok: true; aggregate: MaterialRatingAggregate; myStars: number | null }
      | { ok: false; code: string }
    > {
      async function snapshotAfterWrite(): Promise<{ aggregate: MaterialRatingAggregate; myStars: number | null }> {
        const aggregate = await deps.ratings.getAggregate({
          targetKind: input.targetKind,
          targetId: input.targetId,
        });
        const myStars = await deps.ratings.getMyRating({
          userId: input.userId,
          targetKind: input.targetKind,
          targetId: input.targetId,
        });
        return { aggregate, myStars };
      }

      if (input.targetKind === "content_page") {
        try {
          const row = await loadContentPageOrThrow(input.targetId);
          assertContentPageMutableForPatientPut(row, input.canViewAuthOnlyContent);
        } catch (e) {
          if (e instanceof MaterialRatingAccessError) {
            return { ok: false, code: e.accessCode };
          }
          return { ok: false, code: "not_found" };
        }

        const pid = input.programInstanceId?.trim();
        const sid = input.programStageItemId?.trim();
        if ((pid && !sid) || (!pid && sid)) {
          return { ok: false, code: "missing_program_context" };
        }
        if (pid && sid) {
          const gate = await assertProgramStageItemMatchesTarget({
            userId: input.userId,
            instanceId: pid,
            stageItemId: sid,
            targetKind: "content_page",
            targetId: input.targetId,
          });
          if (!gate.ok) {
            return { ok: false, code: gate.code };
          }
        }

        await deps.ratings.upsertRating({
          userId: input.userId,
          targetKind: input.targetKind,
          targetId: input.targetId,
          stars: input.stars,
        });
        const snap = await snapshotAfterWrite();
        return { ok: true, ...snap };
      }

      try {
        await assertTargetExistsNonContent(input.targetKind, input.targetId);
      } catch {
        return { ok: false, code: "not_found" };
      }

      if (!input.programInstanceId || !input.programStageItemId) {
        return { ok: false, code: "missing_program_context" };
      }
      const gate = await assertProgramStageItemMatchesTarget({
        userId: input.userId,
        instanceId: input.programInstanceId,
        stageItemId: input.programStageItemId,
        targetKind: input.targetKind,
        targetId: input.targetId,
      });
      if (!gate.ok) {
        return { ok: false, code: gate.code };
      }
      await deps.ratings.upsertRating({
        userId: input.userId,
        targetKind: input.targetKind,
        targetId: input.targetId,
        stars: input.stars,
      });
      const snap = await snapshotAfterWrite();
      return { ok: true, ...snap };
    },

    async listDoctorSummary(input: {
      targetKind?: MaterialRatingTargetKind;
      limit: number;
      offset: number;
    }) {
      return deps.ratings.listDoctorSummary(input);
    },
  };
}

export type MaterialRatingService = ReturnType<typeof createMaterialRatingService>;
