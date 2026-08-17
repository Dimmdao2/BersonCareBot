import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { createPgOrgEntitlementsPort } from '@/infra/repos/pgOrgEntitlements';
import { isMechanicEnabled } from '@/modules/org-entitlements/service';
import {
  getDrizzleOrMutationTx,
  runDrizzleMutationTransaction,
  runInDrizzleMutationTransaction,
} from '@/infra/db/drizzleMutationTx';
import {
  treatmentProgramInstanceStageItems as itemTable,
  treatmentProgramInstanceStageGroups as instGroupTable,
  treatmentProgramInstanceStages as stageTable,
  treatmentProgramInstances as instTable,
} from '../../../db/schema/treatmentProgramInstances';
import { recommendations as recommendationsTable } from '../../../db/schema/recommendations';
import { treatmentProgramEvents as eventTable } from '../../../db/schema/treatmentProgramEvents';
import type { TreatmentProgramInstancePort } from '@/modules/treatment-program/ports';
import type {
  AddTreatmentProgramInstanceStageInput,
  AddTreatmentProgramInstanceStageItemInput,
  AppendTreatmentProgramEventInput,
  CreateTreatmentProgramInstanceStageGroupInput,
  CreateTreatmentProgramInstanceTreeInput,
  ExpandTestSetIntoInstanceStageItemsPortInput,
  ExpandTestSetIntoInstanceStageItemsResult,
  ExpandLfkComplexIntoInstanceStageItemsPortInput,
  ExpandLfkComplexIntoInstanceStageItemsResult,
  ReplaceTreatmentProgramInstanceStageItemInput,
  TreatmentProgramAssignmentSource,
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageGroup,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageItemStatus,
  TreatmentProgramInstanceStageRow,
  TreatmentProgramInstanceStageStatus,
  TreatmentProgramInstanceStatus,
  TreatmentProgramInstanceSummary,
  TreatmentProgramItemType,
  UpdateTreatmentProgramInstanceStageGroupInput,
  UpdateTreatmentProgramInstanceStageMetadataInput,
} from '@/modules/treatment-program/types';

import {
  effectiveInstanceStageItemComment,
  TREATMENT_PROGRAM_INSTANCE_FREEFORM_RECOMMENDATION_TAG,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
} from '@/modules/treatment-program/types';
import { withDefaultSystemGroupsIfNeededForTreeStage } from '@/modules/treatment-program/instance-tree-system-groups';
import { assertTreatmentProgramStageItemFitsSystemGroup } from '@/modules/treatment-program/stage-semantics';
import { createPgTreatmentProgramItemSnapshotPort } from '@/infra/repos/pgTreatmentProgramItemSnapshot';
import { testSetItems, testSets } from '../../../db/schema/clinicalTests';
import {
  lfkComplexTemplateExercises,
  lfkComplexTemplates,
  lfkExerciseMedia,
  lfkExerciseRegions,
  lfkExercises,
  mediaFiles,
  mediaFolders,
} from '../../../db/schema/schema';
import { TreatmentProgramExpandNotFoundError } from '@/modules/treatment-program/errors';
import { nullableToIsoStringSafe, toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';

const instanceLfkCatalogEntitlements = createPgOrgEntitlementsPort();

function sameIdSet(ordered: string[], expected: Set<string>): boolean {
  if (ordered.length !== expected.size) return false;
  const seen = new Set<string>();
  for (const id of ordered) {
    if (!expected.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

function sameUuidOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function mapInstance(row: typeof instTable.$inferSelect): TreatmentProgramInstanceSummary {
  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    patientUserId: row.patientUserId,
    templateId: row.templateId ?? null,
    assignedBy: row.assignedBy ?? null,
    assignmentSource: (row.assignmentSource ??
      'doctor') as TreatmentProgramInstanceSummary['assignmentSource'],
    title: row.title,
    status: row.status as TreatmentProgramInstanceStatus,
    createdAt: toIsoStringSafe(row.createdAt),
    updatedAt: toIsoStringSafe(row.updatedAt),
    patientPlanLastOpenedAt: nullableToIsoStringSafe(row.patientPlanLastOpenedAt),
  };
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string | null {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (principalOrganizationId &&
      fallbackOrganizationId &&
      principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId ?? fallbackOrganizationId;
}

function mapStage(row: typeof stageTable.$inferSelect): TreatmentProgramInstanceStageRow {
  return {
    id: row.id,
    instanceId: row.instanceId,
    sourceStageId: row.sourceStageId ?? null,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sortOrder,
    localComment: row.localComment ?? null,
    skipReason: row.skipReason ?? null,
    status: row.status as TreatmentProgramInstanceStageStatus,
    startedAt: row.startedAt ?? null,
    goals: row.goals ?? null,
    objectives: row.objectives ?? null,
    expectedDurationDays: row.expectedDurationDays ?? null,
    expectedDurationText: row.expectedDurationText ?? null,
  };
}

function mapItem(row: typeof itemTable.$inferSelect): TreatmentProgramInstanceStageItemRow {
  return {
    id: row.id,
    stageId: row.stageId,
    itemType: row.itemType as TreatmentProgramItemType,
    itemRefId: row.itemRefId,
    sortOrder: row.sortOrder,
    comment: row.comment ?? null,
    localComment: row.localComment ?? null,
    settings: (row.settings as Record<string, unknown> | null) ?? null,
    snapshot: (row.snapshot as Record<string, unknown>) ?? {},
    completedAt: row.completedAt ?? null,
    isActionable: row.isActionable ?? null,
    status: (row.status ?? 'active') as TreatmentProgramInstanceStageItemStatus,
    groupId: row.groupId ?? null,
    createdAt: row.createdAt,
    lastViewedAt: row.lastViewedAt ?? null,
  };
}

function mapInstanceGroup(
  row: typeof instGroupTable.$inferSelect,
): TreatmentProgramInstanceStageGroup {
  const sk = row.systemKind;
  return {
    id: row.id,
    stageId: row.stageId,
    sourceGroupId: row.sourceGroupId ?? null,
    title: row.title,
    description: row.description ?? null,
    scheduleText: row.scheduleText ?? null,
    sortOrder: row.sortOrder,
    systemKind:
      sk === 'recommendations' || sk === 'tests'
        ? (sk as TreatmentProgramInstanceStageGroup['systemKind'])
        : null,
  };
}

function toDetail(
  inst: typeof instTable.$inferSelect,
  stagesRows: (typeof stageTable.$inferSelect)[],
  itemsRows: (typeof itemTable.$inferSelect)[],
  groupsRows: (typeof instGroupTable.$inferSelect)[],
): TreatmentProgramInstanceDetail {
  const itemsByStage = new Map<string, (typeof itemTable.$inferSelect)[]>();
  for (const it of itemsRows) {
    const list = itemsByStage.get(it.stageId) ?? [];
    list.push(it);
    itemsByStage.set(it.stageId, list);
  }
  const groupsByStage = new Map<string, (typeof instGroupTable.$inferSelect)[]>();
  for (const g of groupsRows) {
    const list = groupsByStage.get(g.stageId) ?? [];
    list.push(g);
    groupsByStage.set(g.stageId, list);
  }
  const stages = stagesRows.map((s) => {
    const items = (itemsByStage.get(s.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map((row) => {
        const base = mapItem(row);
        return {
          ...base,
          effectiveComment: effectiveInstanceStageItemComment(base),
        };
      });
    const groups = (groupsByStage.get(s.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map(mapInstanceGroup);
    return { ...mapStage(s), groups, items };
  });
  return {
    ...mapInstance(inst),
    stages,
  };
}

async function touchInstanceUpdatedAt(
  executor: Pick<ReturnType<typeof getDrizzle>, 'update'>,
  instanceId: string,
): Promise<void> {
  await executor
    .update(instTable)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(instTable.id, instanceId));
}

export function createPgTreatmentProgramInstancePort(): TreatmentProgramInstancePort {
  return {
    async createInstanceTree(
      input: CreateTreatmentProgramInstanceTreeInput,
    ): Promise<TreatmentProgramInstanceDetail> {
      return runDrizzleMutationTransaction(async (tx) => {
        const [inst] = await tx
          .insert(instTable)
          .values({
            organizationId: currentWriteOrganizationId(input.organizationId),
            templateId: input.templateId,
            patientUserId: input.patientUserId,
            assignedBy: input.assignedBy,
            assignmentSource: input.assignmentSource ?? 'doctor',
            title: input.title,
            status: 'active',
          })
          .returning();
        if (!inst) throw new Error('insert instance failed');
        const treeItemTs = new Date().toISOString();

        for (const st of input.stages) {
          const stResolved = withDefaultSystemGroupsIfNeededForTreeStage(st);
          const [srow] = await tx
            .insert(stageTable)
            .values({
              organizationId: currentWriteOrganizationId(inst.organizationId),
              instanceId: inst.id,
              sourceStageId: stResolved.sourceStageId,
              title: stResolved.title,
              description: stResolved.description,
              sortOrder: stResolved.sortOrder,
              localComment: null,
              skipReason: null,
              status: stResolved.status,
              startedAt: stResolved.status === 'in_progress' ? treeItemTs : null,
              goals: stResolved.goals,
              objectives: stResolved.objectives,
              expectedDurationDays: stResolved.expectedDurationDays,
              expectedDurationText: stResolved.expectedDurationText,
            })
            .returning();
          if (!srow) throw new Error('insert stage failed');

          const INTERNAL_REC = '__tp_instance_sys_recommendations__';
          const INTERNAL_TESTS = '__tp_instance_sys_tests__';

          const rawGroups = [...(stResolved.groups ?? [])];
          const systemRec = rawGroups.find((g) => g.systemKind === 'recommendations');
          const systemTests = rawGroups.find((g) => g.systemKind === 'tests');
          const templateGroups = rawGroups
            .filter((g) => !g.systemKind)
            .sort(
              (a, b) =>
                a.sortOrder - b.sortOrder ||
                String(a.sourceGroupId ?? '').localeCompare(String(b.sourceGroupId ?? '')),
            );
          const sortedGroups = [
            ...(systemRec ? [systemRec] : []),
            ...(systemTests ? [systemTests] : []),
            ...templateGroups,
          ];

          const templateGroupIdToInstance = new Map<string, string>();
          for (const g of sortedGroups) {
            const [grow] = await tx
              .insert(instGroupTable)
              .values({
                organizationId: currentWriteOrganizationId(
                  srow.organizationId,
                  inst.organizationId,
                ),
                stageId: srow.id,
                sourceGroupId: g.sourceGroupId ?? null,
                title: g.title,
                description: g.description,
                scheduleText: g.scheduleText,
                sortOrder: g.sortOrder,
                systemKind: g.systemKind ?? null,
              })
              .returning();
            if (!grow) throw new Error('insert instance stage group failed');
            if (g.sourceGroupId) {
              templateGroupIdToInstance.set(g.sourceGroupId, grow.id);
            }
            if (g.systemKind === 'recommendations') {
              templateGroupIdToInstance.set(INTERNAL_REC, grow.id);
            }
            if (g.systemKind === 'tests') {
              templateGroupIdToInstance.set(INTERNAL_TESTS, grow.id);
            }
          }

          const sortedItems = [...stResolved.items].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.itemRefId.localeCompare(b.itemRefId),
          );
          for (const it of sortedItems) {
            let gid: string | null = null;
            if (it.templateGroupId != null) {
              gid = templateGroupIdToInstance.get(it.templateGroupId) ?? null;
            } else if (it.itemType === 'recommendation') {
              gid = templateGroupIdToInstance.get(INTERNAL_REC) ?? null;
            } else if (it.itemType === 'clinical_test') {
              gid = templateGroupIdToInstance.get(INTERNAL_TESTS) ?? null;
            } else {
              throw new Error(
                'Назначение: элемент без группы в шаблоне должен быть только рекомендацией или клиническим тестом',
              );
            }
            await tx.insert(itemTable).values({
              organizationId: currentWriteOrganizationId(srow.organizationId, inst.organizationId),
              stageId: srow.id,
              itemType: it.itemType,
              itemRefId: it.itemRefId,
              sortOrder: it.sortOrder,
              comment: it.comment,
              localComment: null,
              settings: it.settings ?? undefined,
              snapshot: it.snapshot,
              completedAt: null,
              isActionable: it.isActionable ?? null,
              status: it.status ?? 'active',
              groupId: gid,
              createdAt: treeItemTs,
              lastViewedAt: treeItemTs,
            });
          }
        }

        const stagesRows = await tx
          .select()
          .from(stageTable)
          .where(eq(stageTable.instanceId, inst.id))
          .orderBy(asc(stageTable.sortOrder), asc(stageTable.id));
        const allItems =
          stagesRows.length === 0
            ? []
            : await tx
                .select()
                .from(itemTable)
                .where(
                  inArray(
                    itemTable.stageId,
                    stagesRows.map((s) => s.id),
                  ),
                )
                .orderBy(asc(itemTable.stageId), asc(itemTable.sortOrder), asc(itemTable.id));
        const allGroups =
          stagesRows.length === 0
            ? []
            : await tx
                .select()
                .from(instGroupTable)
                .where(
                  inArray(
                    instGroupTable.stageId,
                    stagesRows.map((s) => s.id),
                  ),
                )
                .orderBy(
                  asc(instGroupTable.stageId),
                  asc(instGroupTable.sortOrder),
                  asc(instGroupTable.id),
                );

        return toDetail(inst, stagesRows, allItems, allGroups);
      });
    },

    async getInstanceById(
      id: string,
      organizationId?: string,
    ): Promise<TreatmentProgramInstanceDetail | null> {
      const db = getDrizzleOrMutationTx();
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      const exactOrganizationId = organizationId ?? principalOrganizationId;
      if (
        !exactOrganizationId ||
        (principalOrganizationId && principalOrganizationId !== exactOrganizationId)
      )
        return null;
      const inst = await db.query.treatmentProgramInstances.findFirst({
        where: and(eq(instTable.id, id), eq(instTable.organizationId, exactOrganizationId)),
      });
      if (!inst) return null;
      const stagesRows = await db
        .select()
        .from(stageTable)
        .where(
          and(eq(stageTable.instanceId, id), eq(stageTable.organizationId, exactOrganizationId)),
        )
        .orderBy(asc(stageTable.sortOrder), asc(stageTable.id));
      const sids = stagesRows.map((s) => s.id);
      const itemsRows =
        sids.length === 0
          ? []
          : await db
              .select()
              .from(itemTable)
              .where(
                and(
                  inArray(itemTable.stageId, sids),
                  eq(itemTable.organizationId, exactOrganizationId),
                ),
              )
              .orderBy(asc(itemTable.stageId), asc(itemTable.sortOrder), asc(itemTable.id));
      const groupsRows =
        sids.length === 0
          ? []
          : await db
              .select()
              .from(instGroupTable)
              .where(
                and(
                  inArray(instGroupTable.stageId, sids),
                  eq(instGroupTable.organizationId, exactOrganizationId),
                ),
              )
              .orderBy(
                asc(instGroupTable.stageId),
                asc(instGroupTable.sortOrder),
                asc(instGroupTable.id),
              );
      return toDetail(inst, stagesRows, itemsRows, groupsRows);
    },

    async getInstanceForPatient(
      patientUserId: string,
      instanceId: string,
      organizationId?: string,
    ): Promise<TreatmentProgramInstanceDetail | null> {
      const db = getDrizzleOrMutationTx();
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      const exactOrganizationId = organizationId ?? principalOrganizationId;
      if (
        !exactOrganizationId ||
        (principalOrganizationId && principalOrganizationId !== exactOrganizationId)
      )
        return null;
      const inst = await db.query.treatmentProgramInstances.findFirst({
        where: and(
          eq(instTable.id, instanceId),
          eq(instTable.patientUserId, patientUserId),
          eq(instTable.organizationId, exactOrganizationId),
        ),
      });
      if (!inst) return null;
      const stagesRows = await db
        .select()
        .from(stageTable)
        .where(
          and(
            eq(stageTable.instanceId, instanceId),
            eq(stageTable.organizationId, exactOrganizationId),
          ),
        )
        .orderBy(asc(stageTable.sortOrder), asc(stageTable.id));
      const sids = stagesRows.map((s) => s.id);
      const itemsRows =
        sids.length === 0
          ? []
          : await db
              .select()
              .from(itemTable)
              .where(
                and(
                  inArray(itemTable.stageId, sids),
                  eq(itemTable.organizationId, exactOrganizationId),
                ),
              )
              .orderBy(asc(itemTable.stageId), asc(itemTable.sortOrder), asc(itemTable.id));
      const groupsRows =
        sids.length === 0
          ? []
          : await db
              .select()
              .from(instGroupTable)
              .where(
                and(
                  inArray(instGroupTable.stageId, sids),
                  eq(instGroupTable.organizationId, exactOrganizationId),
                ),
              )
              .orderBy(
                asc(instGroupTable.stageId),
                asc(instGroupTable.sortOrder),
                asc(instGroupTable.id),
              );
      return toDetail(inst, stagesRows, itemsRows, groupsRows);
    },

    async listInstancesForPatient(
      patientUserId: string,
    ): Promise<TreatmentProgramInstanceSummary[]> {
      const db = getDrizzleOrMutationTx();
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      const rows = await db
        .select()
        .from(instTable)
        .where(
          and(
            eq(instTable.patientUserId, patientUserId),
            ...(principalOrganizationId
              ? [eq(instTable.organizationId, principalOrganizationId)]
              : []),
          ),
        )
        .orderBy(desc(instTable.updatedAt), desc(instTable.id));
      return rows.map(mapInstance);
    },

    async listInstancesForPatientClinicalView(
      patientUserId: string,
    ): Promise<TreatmentProgramInstanceSummary[]> {
      const db = getDrizzleOrMutationTx();
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      const rows = await db
        .select()
        .from(instTable)
        .where(
          and(
            eq(instTable.patientUserId, patientUserId),
            ne(instTable.assignmentSource, 'promo'),
            ...(principalOrganizationId
              ? [eq(instTable.organizationId, principalOrganizationId)]
              : []),
          ),
        )
        .orderBy(desc(instTable.updatedAt), desc(instTable.id));
      return rows.map(mapInstance);
    },

    async countInstancesWhere(filter: {
      assignmentSource: TreatmentProgramAssignmentSource;
      status?: TreatmentProgramInstanceStatus;
    }): Promise<number> {
      const db = getDrizzleOrMutationTx();
      const organizationId = getCurrentDbPrincipalOrganizationId();
      if (!organizationId) return 0;
      const conds = [
        eq(instTable.assignmentSource, filter.assignmentSource),
        eq(instTable.organizationId, organizationId),
        ...(filter.status !== undefined ? [eq(instTable.status, filter.status)] : []),
      ];
      const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(instTable)
        .where(and(...conds));
      return row?.c ?? 0;
    },

    async listInstancesWhere(filter: {
      assignmentSource: TreatmentProgramAssignmentSource;
      status?: TreatmentProgramInstanceStatus;
      organizationId?: string;
    }): Promise<TreatmentProgramInstanceSummary[]> {
      const db = getDrizzleOrMutationTx();
      const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
      const organizationId = filter.organizationId ?? principalOrganizationId;
      if (
        !organizationId ||
        (principalOrganizationId && principalOrganizationId !== organizationId)
      )
        return [];
      const conds = [
        eq(instTable.assignmentSource, filter.assignmentSource),
        eq(instTable.organizationId, organizationId),
        ...(filter.status !== undefined ? [eq(instTable.status, filter.status)] : []),
      ];
      const rows = await db
        .select()
        .from(instTable)
        .where(and(...conds))
        .orderBy(desc(instTable.updatedAt), desc(instTable.id));
      return rows.map(mapInstance);
    },

    async updateStageItemLocalComment(
      instanceId: string,
      stageItemId: string,
      localComment: string | null,
    ): Promise<TreatmentProgramInstanceStageItemRow | null> {
      return runDrizzleMutationTransaction(async (tx) => {
        const inst = await tx.query.treatmentProgramInstances.findFirst({
          where: eq(instTable.id, instanceId),
        });
        if (!inst) return null;

        const itemRow = await tx.query.treatmentProgramInstanceStageItems.findFirst({
          where: eq(itemTable.id, stageItemId),
        });
        if (!itemRow) return null;
        const stageRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, itemRow.stageId),
        });
        if (!stageRow || stageRow.instanceId !== instanceId) return null;

        const nextLocal = localComment === null ? null : localComment.trim() || null;

        const [updated] = await tx
          .update(itemTable)
          .set({ localComment: nextLocal })
          .where(eq(itemTable.id, stageItemId))
          .returning();
        return updated ? mapItem(updated) : null;
      });
    },

    async updateInstanceMeta(
      instanceId: string,
      patch: { title?: string; status?: 'active' | 'completed' },
      organizationId?: string,
    ): Promise<TreatmentProgramInstanceSummary | null> {
      const rowPatch: Partial<typeof instTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (patch.title !== undefined) {
        const t = patch.title.trim();
        if (!t) return null;
        rowPatch.title = t;
      }
      if (patch.status !== undefined) rowPatch.status = patch.status;
      return runDrizzleMutationTransaction(async (tx) => {
        const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
        const exactOrganizationId = organizationId ?? principalOrganizationId;
        if (
          !exactOrganizationId ||
          (principalOrganizationId && principalOrganizationId !== exactOrganizationId)
        )
          return null;
        const [row] = await tx
          .update(instTable)
          .set(rowPatch)
          .where(
            and(eq(instTable.id, instanceId), eq(instTable.organizationId, exactOrganizationId)),
          )
          .returning();
        return row ? mapInstance(row) : null;
      });
    },

    async updateInstanceStage(
      instanceId: string,
      stageId: string,
      patch: { status: TreatmentProgramInstanceStageStatus; skipReason?: string | null },
    ) {
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return null;

        const skipReason =
          patch.skipReason === undefined
            ? stRow.skipReason
            : patch.skipReason === null
              ? null
              : patch.skipReason.trim() || null;

        const nextSkip = patch.status === 'skipped' ? skipReason : null;

        /** First time the stage enters `in_progress` (any prior status if `started_at` was still null), not only `available`→`in_progress`. */
        const startedAtForPatch =
          patch.status === 'in_progress' && !stRow.startedAt ? new Date().toISOString() : undefined;

        const [updated] = await tx
          .update(stageTable)
          .set({
            status: patch.status,
            skipReason: nextSkip,
            ...(startedAtForPatch !== undefined ? { startedAt: startedAtForPatch } : {}),
          })
          .where(eq(stageTable.id, stageId))
          .returning();
        if (!updated) return null;

        if (patch.status === 'completed' || patch.status === 'skipped') {
          const nextLocked = await tx
            .select({ id: stageTable.id })
            .from(stageTable)
            .where(
              and(
                eq(stageTable.instanceId, instanceId),
                eq(stageTable.status, 'locked'),
                gt(stageTable.sortOrder, stRow.sortOrder),
              ),
            )
            .orderBy(asc(stageTable.sortOrder), asc(stageTable.id))
            .limit(1);
          const nid = nextLocked[0]?.id;
          if (nid) {
            await tx.update(stageTable).set({ status: 'available' }).where(eq(stageTable.id, nid));
          }
        }

        return mapStage(updated);
      });
    },

    async updateInstanceStageMetadata(
      instanceId: string,
      stageId: string,
      patch: UpdateTreatmentProgramInstanceStageMetadataInput,
    ) {
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return null;

        const rowPatch: Partial<typeof stageTable.$inferInsert> = {};
        if (patch.title !== undefined) {
          const t = patch.title.trim();
          if (!t) return null;
          rowPatch.title = t;
        }
        if (patch.description !== undefined) rowPatch.description = patch.description;
        if (patch.goals !== undefined) rowPatch.goals = patch.goals;
        if (patch.objectives !== undefined) rowPatch.objectives = patch.objectives;
        if (patch.expectedDurationDays !== undefined) {
          rowPatch.expectedDurationDays = patch.expectedDurationDays;
        }
        if (patch.expectedDurationText !== undefined) {
          rowPatch.expectedDurationText = patch.expectedDurationText;
        }

        const [updated] = await tx
          .update(stageTable)
          .set(rowPatch)
          .where(eq(stageTable.id, stageId))
          .returning();
        if (!updated) return null;
        await touchInstanceUpdatedAt(tx, instanceId);
        return mapStage(updated);
      });
    },

    async setStageItemCompletedAt(instanceId: string, itemId: string, completedAt: string | null) {
      return runDrizzleMutationTransaction(async (tx) => {
        const inst = await tx.query.treatmentProgramInstances.findFirst({
          where: eq(instTable.id, instanceId),
        });
        if (!inst) return null;

        const itemRow = await tx.query.treatmentProgramInstanceStageItems.findFirst({
          where: eq(itemTable.id, itemId),
        });
        if (!itemRow) return null;
        const stageRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, itemRow.stageId),
        });
        if (!stageRow || stageRow.instanceId !== instanceId) return null;

        const [updated] = await tx
          .update(itemTable)
          .set({ completedAt })
          .where(eq(itemTable.id, itemId))
          .returning();
        if (updated) await touchInstanceUpdatedAt(tx, instanceId);
        return updated ? mapItem(updated) : null;
      });
    },

    async addInstanceStage(instanceId: string, input: AddTreatmentProgramInstanceStageInput) {
      return runDrizzleMutationTransaction(async (tx) => {
        const inst = await tx.query.treatmentProgramInstances.findFirst({
          where: eq(instTable.id, instanceId),
        });
        if (!inst) return null;
        const [srow] = await tx
          .insert(stageTable)
          .values({
            organizationId: currentWriteOrganizationId(inst.organizationId),
            instanceId,
            sourceStageId: input.sourceStageId ?? null,
            title: input.title,
            description: input.description ?? null,
            sortOrder: input.sortOrder,
            localComment: null,
            skipReason: null,
            status: input.status,
            startedAt: input.status === 'in_progress' ? new Date().toISOString() : null,
            goals: input.goals ?? null,
            objectives: input.objectives ?? null,
            expectedDurationDays: input.expectedDurationDays ?? null,
            expectedDurationText: input.expectedDurationText ?? null,
          })
          .returning();
        if (!srow) return null;
        if (input.sortOrder > 0) {
          await tx.insert(instGroupTable).values({
            organizationId: currentWriteOrganizationId(srow.organizationId, inst.organizationId),
            stageId: srow.id,
            sourceGroupId: null,
            title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
            description: null,
            scheduleText: null,
            sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
            systemKind: 'recommendations',
          });
          await tx.insert(instGroupTable).values({
            organizationId: currentWriteOrganizationId(srow.organizationId, inst.organizationId),
            stageId: srow.id,
            sourceGroupId: null,
            title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
            description: null,
            scheduleText: null,
            sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
            systemKind: 'tests',
          });
        }
        await touchInstanceUpdatedAt(tx, instanceId);
        return mapStage(srow);
      });
    },

    async removeInstanceStage(instanceId: string, stageId: string) {
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return false;
        await tx.delete(stageTable).where(eq(stageTable.id, stageId));
        await touchInstanceUpdatedAt(tx, instanceId);
        return true;
      });
    },

    async addInstanceStageItem(
      instanceId: string,
      stageId: string,
      input: AddTreatmentProgramInstanceStageItemInput,
    ) {
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return null;
        if (input.groupId) {
          const grRows = await tx
            .select()
            .from(instGroupTable)
            .where(eq(instGroupTable.id, input.groupId))
            .limit(1);
          const gr = grRows[0];
          if (!gr || gr.stageId !== stageId) return null;
        }
        const [irow] = await tx
          .insert(itemTable)
          .values({
            organizationId: currentWriteOrganizationId(stRow.organizationId),
            stageId,
            itemType: input.itemType,
            itemRefId: input.itemRefId,
            sortOrder: input.sortOrder,
            comment: input.comment,
            localComment: null,
            settings: input.settings ?? undefined,
            snapshot: input.snapshot,
            completedAt: null,
            isActionable: input.isActionable ?? null,
            status: input.status ?? 'active',
            groupId: input.groupId ?? null,
            lastViewedAt: null,
          })
          .returning();
        if (!irow) return null;
        await touchInstanceUpdatedAt(tx, instanceId);
        return mapItem(irow);
      });
    },

    async createFreeformRecommendationAndStageItem(input: {
      instanceId: string;
      stageId: string;
      title: string;
      bodyMd: string;
      createdBy: string | null;
    }): Promise<{ item: TreatmentProgramInstanceStageItemRow; recommendationId: string } | null> {
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, input.stageId),
        });
        if (!stRow || stRow.instanceId !== input.instanceId || stRow.sortOrder !== 0) {
          return null;
        }

        const title = input.title.trim();
        const bodyMd = input.bodyMd.trim();
        const [rec] = await tx
          .insert(recommendationsTable)
          .values({
            organizationId: currentWriteOrganizationId(stRow.organizationId),
            title,
            bodyMd,
            tags: [TREATMENT_PROGRAM_INSTANCE_FREEFORM_RECOMMENDATION_TAG],
            domain: null,
            createdBy: input.createdBy,
          })
          .returning();
        if (!rec) throw new Error('insert recommendation failed');

        const snapshot: Record<string, unknown> = {
          itemType: 'recommendation' as const,
          id: rec.id,
          title: rec.title,
          bodyMd: rec.bodyMd ?? '',
        };

        const [{ max: itemMax }] = await tx
          .select({ max: sql<number>`coalesce(max(${itemTable.sortOrder}), -1)` })
          .from(itemTable)
          .where(eq(itemTable.stageId, input.stageId));

        const sortOrder = itemMax + 1;

        const [irow] = await tx
          .insert(itemTable)
          .values({
            organizationId: currentWriteOrganizationId(stRow.organizationId),
            stageId: input.stageId,
            itemType: 'recommendation',
            itemRefId: rec.id,
            sortOrder,
            comment: null,
            localComment: null,
            settings: undefined,
            snapshot,
            completedAt: null,
            isActionable: false,
            status: 'active',
            groupId: null,
            lastViewedAt: null,
          })
          .returning();
        if (!irow) throw new Error('insert instance stage item failed');

        await touchInstanceUpdatedAt(tx, input.instanceId);
        return { item: mapItem(irow), recommendationId: rec.id };
      });
    },

    async createIndividualExerciseAndStageItem(input) {
      return runDrizzleMutationTransaction(async (tx) => {
        const organizationId = currentWriteOrganizationId();
        if (!organizationId) throw new Error('organization_context_required');

        const [instance] = await tx
          .select({
            id: instTable.id,
            organizationId: instTable.organizationId,
            patientUserId: instTable.patientUserId,
          })
          .from(instTable)
          .where(
            and(eq(instTable.id, input.instanceId), eq(instTable.organizationId, organizationId)),
          )
          .limit(1);
        if (!instance || instance.organizationId !== organizationId) return null;

        const [stage] = await tx
          .select({
            id: stageTable.id,
            instanceId: stageTable.instanceId,
            organizationId: stageTable.organizationId,
            sortOrder: stageTable.sortOrder,
          })
          .from(stageTable)
          .where(
            and(
              eq(stageTable.id, input.stageId),
              eq(stageTable.instanceId, input.instanceId),
              eq(stageTable.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (
          !stage ||
          stage.instanceId !== input.instanceId ||
          stage.organizationId !== organizationId ||
          stage.sortOrder === 0
        ) {
          return null;
        }

        const [group] = await tx
          .select({
            id: instGroupTable.id,
            stageId: instGroupTable.stageId,
            organizationId: instGroupTable.organizationId,
            systemKind: instGroupTable.systemKind,
          })
          .from(instGroupTable)
          .where(
            and(
              eq(instGroupTable.id, input.groupId),
              eq(instGroupTable.stageId, input.stageId),
              eq(instGroupTable.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (!group || group.stageId !== input.stageId || group.organizationId !== organizationId) {
          return null;
        }
        const systemKind =
          group.systemKind === 'recommendations' || group.systemKind === 'tests'
            ? group.systemKind
            : null;
        assertTreatmentProgramStageItemFitsSystemGroup({ systemKind }, 'exercise');

        if (
          input.difficulty1_10 != null &&
          (input.difficulty1_10 < 1 || input.difficulty1_10 > 10)
        ) {
          throw new Error('Сложность: целое число от 1 до 10');
        }

        if (input.mediaId) {
          const [media] = await tx
            .select({
              id: mediaFiles.id,
              ownerKind: mediaFiles.ownerKind,
              organizationId: mediaFiles.organizationId,
              status: mediaFiles.status,
              mimeType: mediaFiles.mimeType,
              folderOrganizationId: mediaFolders.organizationId,
              folderKind: mediaFolders.kind,
              folderPatientUserId: mediaFolders.patientUserId,
            })
            .from(mediaFiles)
            .innerJoin(mediaFolders, eq(mediaFolders.id, mediaFiles.folderId))
            .where(
              and(
                eq(mediaFiles.id, input.mediaId),
                eq(mediaFiles.ownerKind, 'organization'),
                eq(mediaFiles.organizationId, organizationId),
                eq(mediaFiles.status, 'ready'),
                sql`${mediaFiles.mimeType} LIKE 'video/%'`,
                eq(mediaFolders.organizationId, organizationId),
                eq(mediaFolders.kind, 'client_patient'),
                eq(mediaFolders.patientUserId, instance.patientUserId),
              ),
            )
            .limit(1);
          if (
            !media ||
            media.ownerKind !== 'organization' ||
            media.organizationId !== organizationId ||
            media.status !== 'ready' ||
            !media.mimeType.startsWith('video/') ||
            media.folderOrganizationId !== organizationId ||
            media.folderKind !== 'client_patient' ||
            media.folderPatientUserId !== instance.patientUserId
          ) {
            throw new Error('Видео не найдено или недоступно для этого пациента');
          }
        }

        const title = input.title.trim();
        if (!title) throw new Error('Укажите название упражнения');
        const [exercise] = await tx
          .insert(lfkExercises)
          .values({
            ownerKind: 'organization',
            organizationId,
            catalogScope: input.saveToCatalog ? 'catalog' : 'personal',
            title,
            description: input.description,
            regionRefId: input.regionRefIds[0] ?? null,
            loadType: input.loadType,
            difficulty110: input.difficulty1_10,
            contraindications: input.contraindications,
            tags: input.tags,
            createdBy: input.createdBy,
          })
          .returning();
        if (!exercise) throw new Error('insert individual exercise failed');

        if (input.regionRefIds.length > 0) {
          await tx.insert(lfkExerciseRegions).values(
            [...new Set(input.regionRefIds)].map((regionRefId) => ({
              ownerKind: 'organization',
              organizationId,
              exerciseId: exercise.id,
              regionRefId,
            })),
          );
        }
        if (input.mediaId) {
          await tx.insert(lfkExerciseMedia).values({
            ownerKind: 'organization',
            organizationId,
            exerciseId: exercise.id,
            mediaUrl: `/api/media/${input.mediaId}`,
            mediaType: 'video',
            sortOrder: 0,
          });
        }

        const snapshot: Record<string, unknown> = {
          itemType: 'exercise',
          id: exercise.id,
          title: exercise.title,
          description: exercise.description ?? null,
          contraindications: exercise.contraindications ?? null,
          difficulty: exercise.difficulty110 ?? null,
          loadType: exercise.loadType ?? null,
          exerciseScope: exercise.catalogScope,
          ...(input.mediaId
            ? { media: [{ url: `/api/media/${input.mediaId}`, type: 'video', sortOrder: 0 }] }
            : {}),
        };
        const [{ max: itemMax }] = await tx
          .select({ max: sql<number>`coalesce(max(${itemTable.sortOrder}), -1)` })
          .from(itemTable)
          .where(eq(itemTable.stageId, input.stageId));
        const [item] = await tx
          .insert(itemTable)
          .values({
            organizationId,
            stageId: input.stageId,
            itemType: 'exercise',
            itemRefId: exercise.id,
            sortOrder: itemMax + 1,
            comment: null,
            localComment: input.localComment,
            settings: input.settings,
            snapshot,
            completedAt: null,
            isActionable: null,
            status: 'active',
            groupId: input.groupId,
            lastViewedAt: null,
          })
          .returning();
        if (!item) throw new Error('insert individual exercise item failed');
        await touchInstanceUpdatedAt(tx, input.instanceId);
        return { item: mapItem(item), exerciseId: exercise.id };
      });
    },

    async updatePersonalExerciseTitle(instanceId: string, itemId: string, titleRaw: string) {
      return runDrizzleMutationTransaction(async (tx) => {
        const organizationId = currentWriteOrganizationId();
        if (!organizationId) throw new Error('organization_context_required');
        const title = titleRaw.trim();
        if (!title) throw new Error('Укажите название упражнения');

        const [owned] = await tx
          .select({ item: itemTable, exercise: lfkExercises })
          .from(itemTable)
          .innerJoin(stageTable, eq(stageTable.id, itemTable.stageId))
          .innerJoin(lfkExercises, eq(lfkExercises.id, itemTable.itemRefId))
          .where(
            and(
              eq(itemTable.id, itemId),
              eq(itemTable.itemType, 'exercise'),
              eq(itemTable.organizationId, organizationId),
              eq(stageTable.instanceId, instanceId),
              eq(stageTable.organizationId, organizationId),
              eq(lfkExercises.ownerKind, 'organization'),
              eq(lfkExercises.organizationId, organizationId),
              eq(lfkExercises.catalogScope, 'personal'),
            ),
          )
          .limit(1);
        if (!owned) return null;

        const otherRefs = await tx
          .select({ id: itemTable.id })
          .from(itemTable)
          .where(
            and(
              eq(itemTable.itemType, 'exercise'),
              eq(itemTable.itemRefId, owned.exercise.id),
              ne(itemTable.id, itemId),
            ),
          )
          .limit(1);
        if (otherRefs.length > 0)
          throw new Error('Личное упражнение уже используется в другой программе');

        await tx
          .update(lfkExercises)
          .set({ title, updatedAt: sql`now()` })
          .where(
            and(
              eq(lfkExercises.id, owned.exercise.id),
              eq(lfkExercises.organizationId, organizationId),
              eq(lfkExercises.catalogScope, 'personal'),
            ),
          );
        const [item] = await tx
          .update(itemTable)
          .set({ snapshot: { ...owned.item.snapshot, title } })
          .where(and(eq(itemTable.id, itemId), eq(itemTable.organizationId, organizationId)))
          .returning();
        if (!item) return null;
        await touchInstanceUpdatedAt(tx, instanceId);
        return mapItem(item);
      });
    },

    async expandTestSetIntoInstanceStageItems(
      input: ExpandTestSetIntoInstanceStageItemsPortInput,
    ): Promise<ExpandTestSetIntoInstanceStageItemsResult | null> {
      const snapshots = createPgTreatmentProgramItemSnapshotPort();
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, input.stageId),
        });
        if (!stRow || stRow.instanceId !== input.instanceId) return null;
        if (stRow.sortOrder === 0) {
          throw new Error('На этапе «Общие рекомендации» нельзя разворачивать набор тестов');
        }

        const [setRow] = await tx
          .select()
          .from(testSets)
          .where(and(eq(testSets.id, input.testSetId), eq(testSets.isArchived, false)))
          .limit(1);
        if (!setRow) {
          throw new Error('Набор тестов не найден или в архиве');
        }

        const [testsGroup] = await tx
          .select()
          .from(instGroupTable)
          .where(
            and(eq(instGroupTable.stageId, input.stageId), eq(instGroupTable.systemKind, 'tests')),
          )
          .limit(1);
        if (!testsGroup) {
          throw new Error('Не найдена системная группа «Тестирование» для этапа');
        }

        const lines = await tx
          .select()
          .from(testSetItems)
          .where(eq(testSetItems.testSetId, input.testSetId))
          .orderBy(asc(testSetItems.sortOrder), asc(testSetItems.id));

        const existingRows = await tx
          .select({ refId: itemTable.itemRefId })
          .from(itemTable)
          .where(
            and(
              eq(itemTable.stageId, input.stageId),
              eq(itemTable.groupId, testsGroup.id),
              eq(itemTable.itemType, 'clinical_test'),
            ),
          );
        const existing = new Set(existingRows.map((r) => r.refId));

        const [{ max: itemMax }] = await tx
          .select({ max: sql<number>`coalesce(max(${itemTable.sortOrder}), -1)` })
          .from(itemTable)
          .where(eq(itemTable.stageId, input.stageId));

        let pos = itemMax + 1;
        let added = 0;
        let skipped = 0;
        const inserted: TreatmentProgramInstanceStageItemRow[] = [];
        const nowIso = new Date().toISOString();
        for (const line of lines) {
          if (existing.has(line.testId)) {
            skipped += 1;
            continue;
          }
          existing.add(line.testId);
          const snapshot = await snapshots.buildSnapshot('clinical_test', line.testId);
          const [irow] = await tx
            .insert(itemTable)
            .values({
              organizationId: currentWriteOrganizationId(stRow.organizationId),
              stageId: input.stageId,
              itemType: 'clinical_test',
              itemRefId: line.testId,
              sortOrder: pos++,
              comment: line.comment ?? null,
              localComment: null,
              settings: null,
              snapshot,
              completedAt: null,
              isActionable: null,
              status: 'active',
              groupId: testsGroup.id,
              createdAt: nowIso,
              lastViewedAt: nowIso,
            })
            .returning();
          if (!irow) throw new Error('insert failed');
          inserted.push(mapItem(irow));
          added += 1;
        }
        await touchInstanceUpdatedAt(tx, input.instanceId);
        return { added, skipped, items: inserted };
      });
    },

    async expandLfkComplexIntoInstanceStageItems(
      input: ExpandLfkComplexIntoInstanceStageItemsPortInput,
    ): Promise<ExpandLfkComplexIntoInstanceStageItemsResult | null> {
      const snapshots = createPgTreatmentProgramItemSnapshotPort();
      const organizationId = getCurrentDbPrincipalOrganizationId();
      if (!organizationId)
        throw new TreatmentProgramExpandNotFoundError('Комплекс ЛФК не найден или в архиве');
      const includePlatformBase = await isMechanicEnabled(
        instanceLfkCatalogEntitlements,
        organizationId,
        'exercise_catalog',
      );
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, input.stageId),
        });
        if (!stRow || stRow.instanceId !== input.instanceId) return null;
        if (stRow.sortOrder === 0) {
          throw new Error('На этапе «Общие рекомендации» нельзя разворачивать комплекс ЛФК');
        }

        const complexRow = await tx.query.lfkComplexTemplates.findFirst({
          where: and(
            eq(lfkComplexTemplates.id, input.complexTemplateId),
            ne(lfkComplexTemplates.status, 'archived'),
            or(
              and(
                eq(lfkComplexTemplates.ownerKind, 'organization'),
                eq(lfkComplexTemplates.organizationId, organizationId),
              ),
              includePlatformBase
                ? and(
                    eq(lfkComplexTemplates.ownerKind, 'platform'),
                    isNull(lfkComplexTemplates.organizationId),
                  )
                : undefined,
            ),
          ),
        });
        if (!complexRow)
          throw new TreatmentProgramExpandNotFoundError('Комплекс ЛФК не найден или в архиве');

        const exerciseRows = await tx
          .select()
          .from(lfkComplexTemplateExercises)
          .where(
            and(
              eq(lfkComplexTemplateExercises.templateId, input.complexTemplateId),
              eq(lfkComplexTemplateExercises.ownerKind, complexRow.ownerKind),
              complexRow.ownerKind === 'platform'
                ? isNull(lfkComplexTemplateExercises.organizationId)
                : eq(lfkComplexTemplateExercises.organizationId, organizationId),
            ),
          )
          .orderBy(asc(lfkComplexTemplateExercises.sortOrder), asc(lfkComplexTemplateExercises.id));

        if (exerciseRows.length === 0) throw new Error('В комплексе нет упражнений');

        const idsFromDb = exerciseRows.map((r) => r.exerciseId);
        if (!sameUuidOrder(idsFromDb, input.expectedExerciseIds)) {
          throw new Error('Комплекс ЛФК был изменён; обновите страницу и повторите попытку');
        }

        const [gRow] = await tx
          .select()
          .from(instGroupTable)
          .where(eq(instGroupTable.id, input.groupId))
          .limit(1);
        if (!gRow || gRow.stageId !== input.stageId) {
          throw new TreatmentProgramExpandNotFoundError(
            'Группа не найдена или не принадлежит этапу',
          );
        }
        if (gRow.systemKind === 'recommendations' || gRow.systemKind === 'tests') {
          throw new Error('Нельзя добавить упражнения в системную группу');
        }

        const [{ max: itemMax }] = await tx
          .select({ max: sql<number>`coalesce(max(${itemTable.sortOrder}), -1)` })
          .from(itemTable)
          .where(eq(itemTable.stageId, input.stageId));

        const base = itemMax + 1;
        const nowIso = new Date().toISOString();
        const inserted: TreatmentProgramInstanceStageItemRow[] = [];
        for (let i = 0; i < idsFromDb.length; i++) {
          const line = exerciseRows[i]!;
          const exerciseId = line.exerciseId;
          const snapshot = await snapshots.buildSnapshot('exercise', exerciseId);
          const [irow] = await tx
            .insert(itemTable)
            .values({
              organizationId: currentWriteOrganizationId(stRow.organizationId),
              stageId: input.stageId,
              itemType: 'exercise',
              itemRefId: exerciseId,
              sortOrder: base + i,
              comment: line.comment ?? null,
              localComment: null,
              settings: {
                lfkComplexTemplateId: input.complexTemplateId,
              },
              snapshot,
              completedAt: null,
              isActionable: null,
              status: 'active',
              groupId: input.groupId,
              createdAt: nowIso,
              lastViewedAt: nowIso,
            })
            .returning();
          if (!irow) throw new Error('insert failed');
          inserted.push(mapItem(irow));
        }

        await touchInstanceUpdatedAt(tx, input.instanceId);
        return { items: inserted };
      });
    },

    async patchInstanceStageItem(
      instanceId: string,
      itemId: string,
      patch: {
        status?: TreatmentProgramInstanceStageItemStatus;
        isActionable?: boolean | null;
        groupId?: string | null;
        settings?: Record<string, unknown> | null;
      },
    ) {
      return runDrizzleMutationTransaction(async (tx) => {
        const itemRow = await tx.query.treatmentProgramInstanceStageItems.findFirst({
          where: eq(itemTable.id, itemId),
        });
        if (!itemRow) return null;
        const stageRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, itemRow.stageId),
        });
        if (!stageRow || stageRow.instanceId !== instanceId) return null;

        if (patch.groupId !== undefined && patch.groupId !== null) {
          const gr = await tx
            .select()
            .from(instGroupTable)
            .where(eq(instGroupTable.id, patch.groupId))
            .limit(1);
          const g = gr[0];
          if (!g || g.stageId !== itemRow.stageId) return null;
        }

        const rowPatch: Partial<typeof itemTable.$inferInsert> = {};
        if (patch.status !== undefined) rowPatch.status = patch.status;
        if (patch.isActionable !== undefined) rowPatch.isActionable = patch.isActionable;
        if (patch.groupId !== undefined) rowPatch.groupId = patch.groupId;
        if (patch.settings !== undefined) rowPatch.settings = patch.settings;

        if (Object.keys(rowPatch).length === 0) return mapItem(itemRow);

        const [updated] = await tx
          .update(itemTable)
          .set(rowPatch)
          .where(eq(itemTable.id, itemId))
          .returning();
        if (updated) await touchInstanceUpdatedAt(tx, instanceId);
        return updated ? mapItem(updated) : null;
      });
    },

    async patchInstanceStageItemWithEvent(
      instanceId: string,
      itemId: string,
      patch: {
        status?: TreatmentProgramInstanceStageItemStatus;
        isActionable?: boolean | null;
        groupId?: string | null;
        settings?: Record<string, unknown> | null;
      },
      eventInput: AppendTreatmentProgramEventInput,
    ) {
      if (eventInput.instanceId !== instanceId) {
        throw new Error('patchInstanceStageItemWithEvent: event instanceId mismatch');
      }
      const rowPatch: Partial<typeof itemTable.$inferInsert> = {};
      if (patch.status !== undefined) rowPatch.status = patch.status;
      if (patch.isActionable !== undefined) rowPatch.isActionable = patch.isActionable;
      if (patch.groupId !== undefined) rowPatch.groupId = patch.groupId;
      if (patch.settings !== undefined) rowPatch.settings = patch.settings;
      if (Object.keys(rowPatch).length === 0) return null;
      return runDrizzleMutationTransaction(async (tx) => {
        const itemRow = await tx.query.treatmentProgramInstanceStageItems.findFirst({
          where: eq(itemTable.id, itemId),
        });
        if (!itemRow) return null;
        const stageRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, itemRow.stageId),
        });
        if (!stageRow || stageRow.instanceId !== instanceId) return null;

        if (patch.groupId !== undefined && patch.groupId !== null) {
          const gr = await tx
            .select()
            .from(instGroupTable)
            .where(eq(instGroupTable.id, patch.groupId))
            .limit(1);
          const g = gr[0];
          if (!g || g.stageId !== itemRow.stageId) return null;
        }

        const [updated] = await tx
          .update(itemTable)
          .set(rowPatch)
          .where(eq(itemTable.id, itemId))
          .returning();
        if (!updated) return null;

        await tx
          .update(instTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(instTable.id, instanceId));

        await tx.insert(eventTable).values({
          organizationId: currentWriteOrganizationId(stageRow.organizationId),
          instanceId: eventInput.instanceId,
          actorId: eventInput.actorId,
          eventType: eventInput.eventType,
          targetType: eventInput.targetType,
          targetId: eventInput.targetId,
          payload: eventInput.payload ?? {},
          reason: eventInput.reason ?? null,
        });

        return mapItem(updated);
      });
    },

    async deleteInstanceStageItem(instanceId: string, itemId: string): Promise<boolean> {
      return runDrizzleMutationTransaction(async (tx) => {
        const joined = await tx
          .select({
            item: itemTable,
            instanceIdCol: stageTable.instanceId,
          })
          .from(itemTable)
          .innerJoin(stageTable, eq(itemTable.stageId, stageTable.id))
          .where(eq(itemTable.id, itemId))
          .limit(1);
        const row0 = joined[0];
        if (!row0 || row0.instanceIdCol !== instanceId) return false;
        const it = row0.item;

        await tx.delete(itemTable).where(eq(itemTable.id, itemId));

        if (it.itemType === 'recommendation') {
          const [rec] = await tx
            .select({ tags: recommendationsTable.tags })
            .from(recommendationsTable)
            .where(eq(recommendationsTable.id, it.itemRefId))
            .limit(1);
          const tags = rec?.tags;
          if (
            Array.isArray(tags) &&
            tags.includes(TREATMENT_PROGRAM_INSTANCE_FREEFORM_RECOMMENDATION_TAG)
          ) {
            await tx.delete(recommendationsTable).where(eq(recommendationsTable.id, it.itemRefId));
          }
        }

        await touchInstanceUpdatedAt(tx, instanceId);
        return true;
      });
    },

    async replaceInstanceStageItem(
      instanceId: string,
      itemId: string,
      input: ReplaceTreatmentProgramInstanceStageItemInput,
    ) {
      return runDrizzleMutationTransaction(async (tx) => {
        const itemRow = await tx.query.treatmentProgramInstanceStageItems.findFirst({
          where: eq(itemTable.id, itemId),
        });
        if (!itemRow) return null;
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, itemRow.stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return null;
        const [updated] = await tx
          .update(itemTable)
          .set({
            itemType: input.itemType,
            itemRefId: input.itemRefId,
            sortOrder: input.sortOrder ?? itemRow.sortOrder,
            comment: input.comment === undefined ? itemRow.comment : input.comment,
            settings: input.settings === undefined ? itemRow.settings : input.settings,
            snapshot: input.snapshot,
            completedAt: null,
            status: 'active',
            isActionable: null,
            groupId: null,
            lastViewedAt: null,
            createdAt: new Date().toISOString(),
          })
          .where(eq(itemTable.id, itemId))
          .returning();
        if (!updated) return null;
        await touchInstanceUpdatedAt(tx, instanceId);
        return mapItem(updated);
      });
    },

    async reorderInstanceStages(instanceId: string, orderedStageIds: string[]) {
      return runDrizzleMutationTransaction(async (tx) => {
        const stagesRows = await tx
          .select({ id: stageTable.id, sortOrder: stageTable.sortOrder })
          .from(stageTable)
          .where(eq(stageTable.instanceId, instanceId));
        const idSet = new Set(stagesRows.map((r) => r.id));
        if (!sameIdSet(orderedStageIds, idSet)) return false;
        const zero = stagesRows.find((r) => r.sortOrder === 0);
        if (zero && orderedStageIds[0] !== zero.id) return false;
        for (let i = 0; i < orderedStageIds.length; i++) {
          await tx
            .update(stageTable)
            .set({ sortOrder: i })
            .where(eq(stageTable.id, orderedStageIds[i]!));
        }
        await tx
          .update(instTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(instTable.id, instanceId));
        return true;
      });
    },

    async reorderInstanceStageItems(instanceId: string, stageId: string, orderedItemIds: string[]) {
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return false;
        const itemRows = await tx
          .select({ id: itemTable.id })
          .from(itemTable)
          .where(eq(itemTable.stageId, stageId));
        const idSet = new Set(itemRows.map((r) => r.id));
        if (!sameIdSet(orderedItemIds, idSet)) return false;
        for (let i = 0; i < orderedItemIds.length; i++) {
          await tx
            .update(itemTable)
            .set({ sortOrder: i })
            .where(eq(itemTable.id, orderedItemIds[i]!));
        }
        await tx
          .update(instTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(instTable.id, instanceId));
        return true;
      });
    },

    async createInstanceStageGroup(
      instanceId: string,
      stageId: string,
      input: CreateTreatmentProgramInstanceStageGroupInput,
    ) {
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return null;
        const title = input.title?.trim() ?? '';
        if (!title) return null;
        const [{ max }] = await tx
          .select({ max: sql<number>`coalesce(max(${instGroupTable.sortOrder}), -1)` })
          .from(instGroupTable)
          .where(eq(instGroupTable.stageId, stageId));
        const sortOrder = input.sortOrder ?? max + 1;
        const [row] = await tx
          .insert(instGroupTable)
          .values({
            organizationId: currentWriteOrganizationId(stRow.organizationId),
            stageId,
            sourceGroupId: null,
            title,
            description: input.description?.trim() ?? null,
            scheduleText: input.scheduleText?.trim() ?? null,
            sortOrder,
            systemKind: null,
          })
          .returning();
        if (!row) return null;
        await touchInstanceUpdatedAt(tx, instanceId);
        return mapInstanceGroup(row);
      });
    },

    async updateInstanceStageGroup(
      instanceId: string,
      groupId: string,
      input: UpdateTreatmentProgramInstanceStageGroupInput,
    ) {
      return runDrizzleMutationTransaction(async (tx) => {
        const grRows = await tx
          .select()
          .from(instGroupTable)
          .where(eq(instGroupTable.id, groupId))
          .limit(1);
        const gr = grRows[0];
        if (!gr) return null;
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, gr.stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return null;
        const patch: Partial<typeof instGroupTable.$inferInsert> = {};
        const isSystem = gr.systemKind === 'recommendations' || gr.systemKind === 'tests';
        if (input.title !== undefined && !isSystem) {
          const t = input.title.trim();
          if (!t) return null;
          patch.title = t;
        }
        if (input.description !== undefined && !isSystem)
          patch.description = input.description?.trim() ?? null;
        if (input.scheduleText !== undefined && !isSystem)
          patch.scheduleText = input.scheduleText?.trim() ?? null;
        if (input.sortOrder !== undefined && !isSystem) patch.sortOrder = input.sortOrder;
        if (Object.keys(patch).length === 0) return mapInstanceGroup(gr);
        const [row] = await tx
          .update(instGroupTable)
          .set(patch)
          .where(eq(instGroupTable.id, groupId))
          .returning();
        if (!row) return null;
        await touchInstanceUpdatedAt(tx, instanceId);
        return mapInstanceGroup(row);
      });
    },

    async deleteInstanceStageGroup(instanceId: string, groupId: string) {
      return runDrizzleMutationTransaction(async (tx) => {
        const grRows = await tx
          .select()
          .from(instGroupTable)
          .where(eq(instGroupTable.id, groupId))
          .limit(1);
        const gr = grRows[0];
        if (!gr) return false;
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, gr.stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return false;
        if (gr.systemKind === 'recommendations' || gr.systemKind === 'tests') return false;
        await tx.update(itemTable).set({ groupId: null }).where(eq(itemTable.groupId, groupId));
        const res = await tx
          .delete(instGroupTable)
          .where(eq(instGroupTable.id, groupId))
          .returning({ id: instGroupTable.id });
        if (res.length > 0) await touchInstanceUpdatedAt(tx, instanceId);
        return res.length > 0;
      });
    },

    async reorderInstanceStageGroups(
      instanceId: string,
      stageId: string,
      orderedGroupIds: string[],
    ) {
      return runDrizzleMutationTransaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return false;
        const rows = await tx
          .select({ id: instGroupTable.id, systemKind: instGroupTable.systemKind })
          .from(instGroupTable)
          .where(eq(instGroupTable.stageId, stageId));
        const userIds = rows
          .filter((r) => r.systemKind !== 'recommendations' && r.systemKind !== 'tests')
          .map((r) => r.id);
        const userSet = new Set(userIds);
        if (!sameIdSet(orderedGroupIds, userSet)) return false;
        for (let i = 0; i < orderedGroupIds.length; i++) {
          await tx
            .update(instGroupTable)
            .set({ sortOrder: i })
            .where(eq(instGroupTable.id, orderedGroupIds[i]!));
        }
        await tx
          .update(instTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(instTable.id, instanceId));
        return true;
      });
    },

    async touchPatientPlanLastOpenedAt(patientUserId: string, instanceId: string): Promise<void> {
      void patientUserId;
      await runWebappNamedRoot(
        getWebappSqlDb(),
        'app.touch_current_patient_plan_last_opened(uuid)',
        [instanceId],
        sql`SELECT app.touch_current_patient_plan_last_opened(${instanceId}::uuid) AS updated`,
      );
    },

    async touchCurrentPatientProgramItem(instanceId, stageItemId) {
      const result = await runWebappNamedRoot<{ stage: Record<string, unknown> }>(
        getWebappSqlDb(),
        'app.touch_current_patient_program_item(uuid,uuid)',
        [instanceId, stageItemId],
        sql`SELECT app.touch_current_patient_program_item(
          ${instanceId}::uuid, ${stageItemId}::uuid
        ) AS stage`,
      );
      if (!result.rows[0]?.stage) throw new Error('Элемент не найден');
      return { updatedStage: true };
    },

    async markStageItemViewedIfNever(
      patientUserId: string,
      instanceId: string,
      stageItemId: string,
    ): Promise<{ updated: boolean }> {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const result = await runWebappNamedRoot<{ updated: boolean }>(
          getWebappSqlDb(),
          'app.mark_current_patient_program_item_viewed(uuid,uuid)',
          [instanceId, stageItemId],
          sql`SELECT app.mark_current_patient_program_item_viewed(
            ${instanceId}::uuid, ${stageItemId}::uuid
          ) AS updated`,
        );
        return { updated: result.rows[0]?.updated === true };
      }
      const now = new Date().toISOString();
      return runDrizzleMutationTransaction(async (tx) => {
        const itemRow = await tx.query.treatmentProgramInstanceStageItems.findFirst({
          where: eq(itemTable.id, stageItemId),
        });
        if (!itemRow || itemRow.lastViewedAt != null) return { updated: false };
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, itemRow.stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return { updated: false };
        const instRow = await tx.query.treatmentProgramInstances.findFirst({
          where: and(eq(instTable.id, instanceId), eq(instTable.patientUserId, patientUserId)),
        });
        if (!instRow) return { updated: false };
        const [u] = await tx
          .update(itemTable)
          .set({ lastViewedAt: now })
          .where(and(eq(itemTable.id, stageItemId), isNull(itemTable.lastViewedAt)))
          .returning({ id: itemTable.id });
        return { updated: Boolean(u) };
      });
    },

    async runInMutationTransaction<T>(fn: () => Promise<T>): Promise<T> {
      return runInDrizzleMutationTransaction(fn);
    },
  };
}
