import type { MaterialRatingPort } from './ports';
import type { MaterialRatingAggregate, MaterialRatingTargetKind } from './types';
import { MaterialRatingAccessError } from './types';
import type {
  TreatmentProgramInstancePort,
  TreatmentProgramItemRefValidationPort,
} from '@/modules/treatment-program/ports';
import {
  isInstanceStageItemActiveForPatient,
  isStageZero,
} from '@/modules/treatment-program/stage-semantics';
import { treatmentProgramItemToRatingTarget } from './mapProgramItemToTarget';

/** Снимок CMS-страницы для правил оценки (без импорта из `infra/repos`). */
export type MaterialRatingContentPageSnapshot = {
  organizationId: string | null;
  deletedAt: string | null;
  archivedAt: string | null;
  isPublished: boolean;
  requiresAuth: boolean;
};

export type MaterialRatingContentPagesPort = {
  getById(input: {
    id: string;
    organizationId: string;
  }): Promise<MaterialRatingContentPageSnapshot | null>;
};

export function createMaterialRatingService(deps: {
  ratings: MaterialRatingPort;
  contentPages: MaterialRatingContentPagesPort;
  itemRefs: TreatmentProgramItemRefValidationPort;
  instances: TreatmentProgramInstancePort;
}) {
  async function loadContentPageOrThrow(input: {
    targetId: string;
    organizationId: string;
  }): Promise<MaterialRatingContentPageSnapshot> {
    const row = await deps.contentPages.getById({
      id: input.targetId,
      organizationId: input.organizationId,
    });
    if (!row || row.organizationId !== input.organizationId || row.deletedAt) {
      throw new MaterialRatingAccessError('not_found');
    }
    return row;
  }

  /** Пациентский GET: как у каталога / материала по slug — только опубликованное, не в архиве. */
  function assertContentPageReadableForPatientGet(
    row: MaterialRatingContentPageSnapshot,
    canViewAuthOnly: boolean,
  ) {
    if (!row.isPublished || row.archivedAt) {
      throw new MaterialRatingAccessError('not_found');
    }
    if (row.requiresAuth && !canViewAuthOnly) {
      throw new MaterialRatingAccessError('not_found');
    }
  }

  /** Пациентский PUT: те же ограничения видимости; при `requires_auth` без tier — 403. */
  function assertContentPageMutableForPatientPut(
    row: MaterialRatingContentPageSnapshot,
    canViewAuthOnly: boolean,
  ) {
    if (!row.isPublished || row.archivedAt) {
      throw new MaterialRatingAccessError('not_found');
    }
    if (row.requiresAuth && !canViewAuthOnly) {
      throw new MaterialRatingAccessError('forbidden');
    }
  }

  async function assertTargetExistsNonContent(input: {
    targetKind: Exclude<MaterialRatingTargetKind, 'content_page'>;
    targetId: string;
    organizationId: string;
  }) {
    if (input.targetKind === 'lfk_exercise') {
      await deps.itemRefs.assertItemRefExists('exercise', input.targetId, input.organizationId);
      return;
    }
    await deps.itemRefs.assertItemRefExists('lfk_complex', input.targetId, input.organizationId);
  }

  async function assertProgramStageItemMatchesTarget(input: {
    userId: string;
    instanceId: string;
    stageItemId: string;
    organizationId: string;
    targetKind: MaterialRatingTargetKind;
    targetId: string;
  }): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'forbidden' }> {
    const detail = await deps.instances.getInstanceForPatient(
      input.userId,
      input.instanceId,
      input.organizationId,
    );
    if (!detail) return { ok: false, code: 'not_found' };
    const item = detail.stages.flatMap((s) => s.items).find((i) => i.id === input.stageItemId);
    if (!item) return { ok: false, code: 'not_found' };
    const stage = detail.stages.find((s) => s.id === item.stageId);
    if (!stage) return { ok: false, code: 'not_found' };
    if (!isInstanceStageItemActiveForPatient(item)) return { ok: false, code: 'forbidden' };
    if (!isStageZero(stage) && (stage.status === 'locked' || stage.status === 'skipped')) {
      return { ok: false, code: 'forbidden' };
    }
    const mapped = treatmentProgramItemToRatingTarget(item.itemType, item.itemRefId);
    if (!mapped.kind || mapped.targetId !== input.targetId || mapped.kind !== input.targetKind) {
      return { ok: false, code: 'forbidden' };
    }
    return { ok: true };
  }

  return {
    async getPublicAggregate(input: {
      organizationId: string;
      targetKind: MaterialRatingTargetKind;
      targetId: string;
      excludedUserIds?: string[];
    }) {
      if (input.targetKind === 'content_page') {
        await loadContentPageOrThrow({
          targetId: input.targetId,
          organizationId: input.organizationId,
        });
      } else {
        try {
          await assertTargetExistsNonContent({
            organizationId: input.organizationId,
            targetKind: input.targetKind,
            targetId: input.targetId,
          });
        } catch {
          throw new MaterialRatingAccessError('not_found');
        }
      }
      return deps.ratings.getAggregate(input);
    },

    async getForPatient(input: {
      organizationId: string;
      userId: string | null;
      targetKind: MaterialRatingTargetKind;
      targetId: string;
      programInstanceId?: string | null;
      programStageItemId?: string | null;
      /** Tier пациента для `requires_auth` страниц; для гостя — false. */
      canViewAuthOnlyContent: boolean;
    }): Promise<{ aggregate: MaterialRatingAggregate; myStars: number | null }> {
      let assignedProgramTarget = false;
      if (input.targetKind === 'content_page') {
        const row = await loadContentPageOrThrow({
          targetId: input.targetId,
          organizationId: input.organizationId,
        });
        assertContentPageReadableForPatientGet(row, input.canViewAuthOnlyContent);
      } else {
        if (input.userId && input.programInstanceId && input.programStageItemId) {
          const gate = await assertProgramStageItemMatchesTarget({
            userId: input.userId,
            instanceId: input.programInstanceId,
            stageItemId: input.programStageItemId,
            organizationId: input.organizationId,
            targetKind: input.targetKind,
            targetId: input.targetId,
          });
          assignedProgramTarget = gate.ok;
        }
        if (!assignedProgramTarget) {
          try {
            await assertTargetExistsNonContent({
              organizationId: input.organizationId,
              targetKind: input.targetKind,
              targetId: input.targetId,
            });
          } catch {
            throw new MaterialRatingAccessError('not_found');
          }
        }
      }

      const snapshot = await deps.ratings.getPatientSnapshot({
        organizationId: input.organizationId,
        userId: input.userId,
        targetKind: input.targetKind,
        targetId: input.targetId,
      });

      if (!input.userId) {
        return { aggregate: snapshot.aggregate, myStars: null };
      }
      if (
        input.targetKind !== 'content_page' &&
        (!input.programInstanceId || !input.programStageItemId)
      ) {
        return { aggregate: snapshot.aggregate, myStars: null };
      }
      if (input.targetKind !== 'content_page') {
        if (!assignedProgramTarget) {
          return { aggregate: snapshot.aggregate, myStars: null };
        }
      }
      return snapshot;
    },

    async putForPatient(input: {
      organizationId: string;
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
      async function snapshotAfterWrite(): Promise<{
        aggregate: MaterialRatingAggregate;
        myStars: number | null;
      }> {
        return deps.ratings.getPatientSnapshot({
          organizationId: input.organizationId,
          userId: input.userId,
          targetKind: input.targetKind,
          targetId: input.targetId,
        });
      }

      if (input.targetKind === 'content_page') {
        try {
          const row = await loadContentPageOrThrow({
            targetId: input.targetId,
            organizationId: input.organizationId,
          });
          assertContentPageMutableForPatientPut(row, input.canViewAuthOnlyContent);
        } catch (e) {
          if (e instanceof MaterialRatingAccessError) {
            return { ok: false, code: e.accessCode };
          }
          return { ok: false, code: 'not_found' };
        }

        const pid = input.programInstanceId?.trim();
        const sid = input.programStageItemId?.trim();
        if ((pid && !sid) || (!pid && sid)) {
          return { ok: false, code: 'missing_program_context' };
        }
        if (pid && sid) {
          const gate = await assertProgramStageItemMatchesTarget({
            userId: input.userId,
            instanceId: pid,
            stageItemId: sid,
            organizationId: input.organizationId,
            targetKind: 'content_page',
            targetId: input.targetId,
          });
          if (!gate.ok) {
            return { ok: false, code: gate.code };
          }
        }

        await deps.ratings.upsertRating({
          organizationId: input.organizationId,
          userId: input.userId,
          targetKind: input.targetKind,
          targetId: input.targetId,
          stars: input.stars,
        });
        const snap = await snapshotAfterWrite();
        return { ok: true, ...snap };
      }

      try {
        await assertTargetExistsNonContent({
          organizationId: input.organizationId,
          targetKind: input.targetKind,
          targetId: input.targetId,
        });
      } catch {
        return { ok: false, code: 'not_found' };
      }

      if (!input.programInstanceId || !input.programStageItemId) {
        return { ok: false, code: 'missing_program_context' };
      }
      const gate = await assertProgramStageItemMatchesTarget({
        userId: input.userId,
        instanceId: input.programInstanceId,
        stageItemId: input.programStageItemId,
        organizationId: input.organizationId,
        targetKind: input.targetKind,
        targetId: input.targetId,
      });
      if (!gate.ok) {
        return { ok: false, code: gate.code };
      }
      await deps.ratings.upsertRating({
        organizationId: input.organizationId,
        userId: input.userId,
        targetKind: input.targetKind,
        targetId: input.targetId,
        stars: input.stars,
      });
      const snap = await snapshotAfterWrite();
      return { ok: true, ...snap };
    },

    async listDoctorSummary(input: {
      organizationId: string;
      targetKind?: MaterialRatingTargetKind;
      limit: number;
      offset: number;
      excludedUserIds?: string[];
    }) {
      return deps.ratings.listDoctorSummary(input);
    },

    /**
     * Батч-агрегаты для списков в кабинете врача (карточки контента): без
     * проверки существования каждой цели — это вьюшка над уже загруженным списком.
     */
    async listDoctorAggregates(input: {
      organizationId: string;
      targetKind: MaterialRatingTargetKind;
      targetIds: string[];
      excludedUserIds?: string[];
    }): Promise<Map<string, MaterialRatingAggregate>> {
      if (input.targetIds.length === 0) return new Map();
      return deps.ratings.listAggregates(input);
    },

    /**
     * Детализация для кабинета врача: цель должна существовать.
     * Для `content_page` достаточно строки в CMS без soft-delete — черновики/неопубликованное допустимы (врач редактирует контент).
     */
    async getDoctorDetailForDoctor(input: {
      organizationId: string;
      targetKind: MaterialRatingTargetKind;
      targetId: string;
      iana: string;
      startUtcIso: string;
      endExclusiveUtcIso: string;
      dayKeys: string[];
      excludedUserIds?: string[];
    }) {
      if (input.targetKind === 'content_page') {
        await loadContentPageOrThrow({
          targetId: input.targetId,
          organizationId: input.organizationId,
        });
      } else {
        try {
          await assertTargetExistsNonContent({
            organizationId: input.organizationId,
            targetKind: input.targetKind,
            targetId: input.targetId,
          });
        } catch {
          throw new MaterialRatingAccessError('not_found');
        }
      }
      return deps.ratings.getDoctorDetail(input);
    },
  };
}

export type MaterialRatingService = ReturnType<typeof createMaterialRatingService>;
