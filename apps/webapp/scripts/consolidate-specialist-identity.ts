#!/usr/bin/env tsx
/**
 * One-off: сведение дублей канонического специалиста к одному (solo-specialist модель).
 *
 * Исторически Rubitime создавал отдельного «специалиста» для каждого филиала. Скрипт:
 *   1) repoint-ит ссылки дублей на canonical specialist;
 *   2) conflict-safe удаляет дубли link-строк перед repoint;
 *   3) remap-ит Rubitime specialist mappings;
 *   4) деактивирует duplicate specialists без hard-delete;
 *   5) по умолчанию назначает NULL-specialist appointments canonical specialist.
 *
 * Безопасность:
 *   - dry-run по умолчанию; запись только с --commit, одной Drizzle-транзакцией;
 *   - --summary-only не печатает и не сохраняет имена, телефоны, specialist/org/duplicate IDs,
 *     timestamps или appointment slots;
 *   - commit audit создаётся приватным regular file (0600 + fsync) ДО транзакции; существующий
 *     файл или symlink не перезаписывается;
 *   - подробный ручной режим сохраняет прежний PLAN, но его audit тоже приватный.
 *
 * Запуск:
 *   set -a && source apps/webapp/.env.dev && set +a
 *   pnpm --dir apps/webapp run consolidate-specialist-identity
 *   pnpm --dir apps/webapp run consolidate-specialist-identity -- --commit
 *   pnpm --dir apps/webapp run consolidate-specialist-identity -- --summary-only
 *   # опц.: --canonical=<uuid> --org=<uuid> --merge-all --no-assign-nulls
 */

import {
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  beAppointments,
  beAvailabilityRules,
  beExternalEntityMappings,
  beOrganizationMembers,
  beScheduleBlocks,
  beSpecialistLocations,
  beSpecialistRooms,
  beSpecialistServiceAvailability,
  beSpecialists,
  beWorkingDays,
  beWorkingHours,
} from '../db/schema';

const argv = process.argv.slice(2);
const hasFlag = (name: string): boolean => argv.includes(`--${name}`);
const getOpt = (name: string): string | null => {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const COMMIT = hasFlag('commit');
const MERGE_ALL = hasFlag('merge-all');
const ASSIGN_NULLS = !hasFlag('no-assign-nulls');
const SUMMARY_ONLY = hasFlag('summary-only');
const CANONICAL = getOpt('canonical');
const ORG = getOpt('org');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TERMINAL_APPOINTMENT_STATUSES = [
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
  'completed',
  'visit_confirmed',
];

type CleanupStats = Record<string, number>;

export type ExplicitCanonicalCandidate = {
  isActive: boolean;
  organizationId: string;
};

export type ExplicitCanonicalValidation =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'inactive' | 'organization_mismatch' };

/** Pure fail-closed gate used before an explicit canonical specialist can enter a mutation plan. */
export function validateExplicitCanonicalCandidate(
  candidate: ExplicitCanonicalCandidate | null | undefined,
  expectedOrganizationId: string | null,
): ExplicitCanonicalValidation {
  if (!candidate) {
    return { ok: false, reason: 'not_found' };
  }
  if (!candidate.isActive) {
    return { ok: false, reason: 'inactive' };
  }
  if (expectedOrganizationId !== null && candidate.organizationId !== expectedOrganizationId) {
    return { ok: false, reason: 'organization_mismatch' };
  }
  return { ok: true };
}

type DetailedAudit = {
  primaryId: string;
  primaryName: string;
  duplicateIds: string[];
  skippedOverlapAppointments: Array<{ id: string; slot: string }>;
};

type AuditArtifact =
  | {
      state: 'planned' | 'applied';
      mode: 'summary-only';
      stats: CleanupStats;
    }
  | {
      state: 'planned' | 'applied';
      mode: 'detailed';
      createdAt: string;
      appliedAt?: string;
      stats: CleanupStats;
      audit: DetailedAudit;
    };

function syncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function createPrivateAuditArtifact(path: string, artifact: AuditArtifact): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirStat = lstatSync(dir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
    throw new Error('refusing non-regular specialist consolidation audit directory');
  }

  const fd = openSync(path, 'wx', 0o600);
  try {
    const fileStat = fstatSync(fd);
    if (!fileStat.isFile()) {
      throw new Error('refusing non-regular specialist consolidation audit file');
    }
    writeFileSync(fd, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8' });
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  syncDirectory(dir);
}

function printSummary(stats: CleanupStats): void {
  if (SUMMARY_ONLY) {
    console.log(
      JSON.stringify({
        mode: COMMIT ? 'commit' : 'dry-run',
        stats,
      }),
    );
    return;
  }

  console.log('\n=== SUMMARY ===');
  console.table(stats);
}

function ids(rows: ReadonlyArray<{ id: string }>): string[] {
  return rows.map((row) => row.id);
}

function withoutIds(
  rows: ReadonlyArray<{ id: string }>,
  excludedIds: ReadonlySet<string>,
): string[] {
  return rows.filter((row) => !excludedIds.has(row.id)).map((row) => row.id);
}

async function main() {
  let transactionCommitted = false;

  if (!process.env.DATABASE_URL) {
    console.error(
      'MISSING DATABASE_URL — сначала: set -a && source apps/webapp/.env.dev && set +a',
    );
    process.exitCode = 1;
    return;
  }
  for (const [name, value] of [
    ['canonical', CANONICAL],
    ['org', ORG],
  ] as const) {
    if (value !== null && !UUID_RE.test(value)) {
      console.error(
        SUMMARY_ONLY
          ? `--${name} must be a valid uuid`
          : `--${name} должен быть uuid, получено: ${value}`,
      );
      process.exitCode = 1;
      return;
    }
  }

  try {
    const { getDrizzle } = await import('@/app-layer/db/drizzle');
    const db = getDrizzle();
    const stats: CleanupStats = {};

    const appointmentCount = count(beAppointments.id);
    let primaryId = CANONICAL;
    let primaryName: string;
    let primaryOrg: string;

    if (!primaryId) {
      const primaryRows = await db
        .select({
          id: beSpecialists.id,
          fullName: beSpecialists.fullName,
          organizationId: beSpecialists.organizationId,
          appointmentCount,
        })
        .from(beSpecialists)
        .leftJoin(beAppointments, eq(beAppointments.specialistId, beSpecialists.id))
        .where(
          and(
            eq(beSpecialists.isActive, true),
            ORG ? eq(beSpecialists.organizationId, ORG) : undefined,
          ),
        )
        .groupBy(beSpecialists.id)
        .orderBy(desc(appointmentCount), asc(beSpecialists.createdAt))
        .limit(1);
      const primary = primaryRows[0];
      if (!primary) {
        if (SUMMARY_ONLY) {
          console.log(JSON.stringify({ mode: COMMIT ? 'commit' : 'dry-run', stats }));
        } else {
          console.error('Не найдено активных специалистов — нечего сводить.');
        }
        return;
      }
      primaryId = primary.id;
      primaryName = primary.fullName;
      primaryOrg = primary.organizationId;
    } else {
      const primaryRows = await db
        .select({
          fullName: beSpecialists.fullName,
          organizationId: beSpecialists.organizationId,
          isActive: beSpecialists.isActive,
        })
        .from(beSpecialists)
        .where(eq(beSpecialists.id, primaryId))
        .limit(1);
      const primary = primaryRows[0];
      const validation = validateExplicitCanonicalCandidate(primary, ORG);
      if (!validation.ok) {
        const message =
          validation.reason === 'not_found'
            ? 'canonical specialist was not found'
            : validation.reason === 'inactive'
              ? 'canonical specialist is inactive'
              : 'canonical specialist belongs to another organization';
        console.error(message);
        process.exitCode = 1;
        return;
      }
      // The validation above proves `primary` exists before any mutation plan or audit artifact is built.
      if (!primary) throw new Error('unreachable canonical validation state');
      primaryName = primary.fullName;
      primaryOrg = primary.organizationId;
    }

    const duplicateRows = await db
      .select({ id: beSpecialists.id })
      .from(beSpecialists)
      .where(
        and(
          eq(beSpecialists.organizationId, primaryOrg),
          eq(beSpecialists.isActive, true),
          ne(beSpecialists.id, primaryId),
          MERGE_ALL ? undefined : eq(beSpecialists.fullName, primaryName),
        ),
      );
    const duplicateIds = ids(duplicateRows);

    if (!SUMMARY_ONLY) {
      console.log('\n=== PLAN ===');
      console.log(`primary: ${primaryId} (${primaryName}) org=${primaryOrg}`);
      console.log(`duplicates (${duplicateIds.length}):`, duplicateIds.join(', ') || '—');
    }

    if (duplicateIds.length === 0 && !ASSIGN_NULLS) {
      if (SUMMARY_ONLY) {
        printSummary(stats);
      } else {
        console.log('Нет дублей и assign-nulls выключен — нечего делать.');
      }
      return;
    }

    const duplicateAppointments = alias(beAppointments, 'duplicate_appointments');
    const primaryAppointments = alias(beAppointments, 'primary_appointments');
    const overlapRows =
      duplicateIds.length === 0
        ? []
        : await db
            .select({ id: duplicateAppointments.id, slot: duplicateAppointments.startAt })
            .from(duplicateAppointments)
            .where(
              and(
                inArray(duplicateAppointments.specialistId, duplicateIds),
                isNull(duplicateAppointments.deletedAt),
                notInArray(duplicateAppointments.status, TERMINAL_APPOINTMENT_STATUSES),
                exists(
                  db
                    .select({ id: primaryAppointments.id })
                    .from(primaryAppointments)
                    .where(
                      and(
                        eq(primaryAppointments.specialistId, primaryId),
                        isNull(primaryAppointments.deletedAt),
                        notInArray(primaryAppointments.status, TERMINAL_APPOINTMENT_STATUSES),
                        lt(primaryAppointments.startAt, duplicateAppointments.endAt),
                        gt(primaryAppointments.endAt, duplicateAppointments.startAt),
                      ),
                    ),
                ),
              ),
            );
    const skippedAppointmentIds = new Set(ids(overlapRows));
    stats.be_appointments_skipped_overlap = overlapRows.length;

    if (!SUMMARY_ONLY && overlapRows.length > 0) {
      console.log(
        '\n⚠ ПРОПУЩЕНЫ (double-book, переносить нельзя) — решает владелец:',
        overlapRows.map((row) => row.slot).join(', '),
      );
    }

    const [
      duplicateAppointmentRows,
      availabilityRuleRows,
      scheduleBlockRows,
      workingHourRows,
      workingDayRows,
      specialistLocationRows,
      primaryLocationRows,
      specialistRoomRows,
      primaryRoomRows,
      specialistServiceRows,
      primaryServiceRows,
      organizationMemberRows,
      externalMappingRows,
      nullAppointmentRows,
    ] = await Promise.all([
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beAppointments.id })
            .from(beAppointments)
            .where(inArray(beAppointments.specialistId, duplicateIds)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beAvailabilityRules.id })
            .from(beAvailabilityRules)
            .where(inArray(beAvailabilityRules.specialistId, duplicateIds)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beScheduleBlocks.id })
            .from(beScheduleBlocks)
            .where(inArray(beScheduleBlocks.specialistId, duplicateIds)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beWorkingHours.id })
            .from(beWorkingHours)
            .where(inArray(beWorkingHours.specialistId, duplicateIds)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beWorkingDays.id })
            .from(beWorkingDays)
            .where(inArray(beWorkingDays.specialistId, duplicateIds)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beSpecialistLocations.id, branchId: beSpecialistLocations.branchId })
            .from(beSpecialistLocations)
            .where(inArray(beSpecialistLocations.specialistId, duplicateIds)),
      db
        .select({ branchId: beSpecialistLocations.branchId })
        .from(beSpecialistLocations)
        .where(eq(beSpecialistLocations.specialistId, primaryId)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beSpecialistRooms.id, roomId: beSpecialistRooms.roomId })
            .from(beSpecialistRooms)
            .where(inArray(beSpecialistRooms.specialistId, duplicateIds)),
      db
        .select({ roomId: beSpecialistRooms.roomId })
        .from(beSpecialistRooms)
        .where(eq(beSpecialistRooms.specialistId, primaryId)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              id: beSpecialistServiceAvailability.id,
              serviceId: beSpecialistServiceAvailability.serviceId,
              branchId: beSpecialistServiceAvailability.branchId,
              roomId: beSpecialistServiceAvailability.roomId,
              cityCode: beSpecialistServiceAvailability.cityCode,
            })
            .from(beSpecialistServiceAvailability)
            .where(inArray(beSpecialistServiceAvailability.specialistId, duplicateIds)),
      db
        .select({
          serviceId: beSpecialistServiceAvailability.serviceId,
          branchId: beSpecialistServiceAvailability.branchId,
          roomId: beSpecialistServiceAvailability.roomId,
          cityCode: beSpecialistServiceAvailability.cityCode,
        })
        .from(beSpecialistServiceAvailability)
        .where(eq(beSpecialistServiceAvailability.specialistId, primaryId)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beOrganizationMembers.id })
            .from(beOrganizationMembers)
            .where(inArray(beOrganizationMembers.specialistId, duplicateIds)),
      duplicateIds.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: beExternalEntityMappings.id })
            .from(beExternalEntityMappings)
            .where(
              and(
                eq(beExternalEntityMappings.entityType, 'specialist'),
                eq(beExternalEntityMappings.externalSystem, 'rubitime'),
                inArray(beExternalEntityMappings.canonicalId, duplicateIds),
              ),
            ),
      ASSIGN_NULLS
        ? db
            .select({ id: beAppointments.id })
            .from(beAppointments)
            .where(
              and(
                isNull(beAppointments.specialistId),
                eq(beAppointments.organizationId, ORG ?? primaryOrg),
              ),
            )
        : Promise.resolve([]),
    ]);

    const primaryBranches = new Set(primaryLocationRows.map((row) => row.branchId));
    const locationCollisionIds = new Set(
      specialistLocationRows
        .filter((row) => primaryBranches.has(row.branchId))
        .map((row) => row.id),
    );
    const primaryRooms = new Set(primaryRoomRows.map((row) => row.roomId));
    const roomCollisionIds = new Set(
      specialistRoomRows.filter((row) => primaryRooms.has(row.roomId)).map((row) => row.id),
    );
    const primaryServiceKeys = new Set(
      primaryServiceRows
        .filter((row) => row.branchId !== null && row.roomId !== null && row.cityCode !== null)
        .map((row) => `${row.serviceId}|${row.branchId}|${row.roomId}|${row.cityCode}`),
    );
    const serviceCollisionIds = new Set(
      specialistServiceRows
        .filter(
          (row) =>
            row.branchId !== null &&
            row.roomId !== null &&
            row.cityCode !== null &&
            primaryServiceKeys.has(
              `${row.serviceId}|${row.branchId}|${row.roomId}|${row.cityCode}`,
            ),
        )
        .map((row) => row.id),
    );

    const repointIds = {
      beAppointments: withoutIds(duplicateAppointmentRows, skippedAppointmentIds),
      beAvailabilityRules: ids(availabilityRuleRows),
      beScheduleBlocks: ids(scheduleBlockRows),
      beWorkingHours: ids(workingHourRows),
      beWorkingDays: ids(workingDayRows),
      beSpecialistLocations: withoutIds(specialistLocationRows, locationCollisionIds),
      beSpecialistRooms: withoutIds(specialistRoomRows, roomCollisionIds),
      beSpecialistServiceAvailability: withoutIds(specialistServiceRows, serviceCollisionIds),
      beOrganizationMembers: ids(organizationMemberRows),
    };

    stats.be_appointments_repointed = repointIds.beAppointments.length;
    stats.be_availability_rules_repointed = repointIds.beAvailabilityRules.length;
    stats.be_schedule_blocks_repointed = repointIds.beScheduleBlocks.length;
    stats.be_working_hours_repointed = repointIds.beWorkingHours.length;
    stats.be_working_days_repointed = repointIds.beWorkingDays.length;
    stats.be_specialist_locations_repointed = repointIds.beSpecialistLocations.length;
    stats.be_specialist_rooms_repointed = repointIds.beSpecialistRooms.length;
    stats.be_specialist_service_availability_repointed =
      repointIds.beSpecialistServiceAvailability.length;
    stats.be_organization_members_repointed = repointIds.beOrganizationMembers.length;
    if (duplicateIds.length > 0) {
      stats.be_specialist_locations_collisions_deleted = locationCollisionIds.size;
      stats.be_specialist_rooms_collisions_deleted = roomCollisionIds.size;
      stats.be_specialist_service_availability_collisions_deleted = serviceCollisionIds.size;
      stats.external_mappings_remapped = externalMappingRows.length;
      stats.specialists_deactivated = duplicateIds.length;
    }
    if (ASSIGN_NULLS) {
      stats.null_appointments_assigned = nullAppointmentRows.length;
    }

    const createdAt = new Date().toISOString();
    const runSuffix = SUMMARY_ONLY ? randomUUID() : createdAt.replace(/[:.]/g, '-');
    const auditDir = resolvePath(process.cwd(), '../../.tmp/specialist-consolidation');
    const plannedAuditPath = resolvePath(auditDir, `planned-${runSuffix}.json`);
    const appliedAuditPath = resolvePath(auditDir, `applied-${runSuffix}.json`);
    const detailedAudit: DetailedAudit = {
      primaryId,
      primaryName,
      duplicateIds,
      skippedOverlapAppointments: overlapRows,
    };
    const plannedArtifact: AuditArtifact = SUMMARY_ONLY
      ? { state: 'planned', mode: 'summary-only', stats }
      : { state: 'planned', mode: 'detailed', createdAt, stats, audit: detailedAudit };

    if (COMMIT) {
      createPrivateAuditArtifact(plannedAuditPath, plannedArtifact);
      const updatedAt = new Date().toISOString();

      await db.transaction(async (tx) => {
        if (locationCollisionIds.size > 0) {
          await tx
            .delete(beSpecialistLocations)
            .where(inArray(beSpecialistLocations.id, [...locationCollisionIds]));
        }
        if (roomCollisionIds.size > 0) {
          await tx
            .delete(beSpecialistRooms)
            .where(inArray(beSpecialistRooms.id, [...roomCollisionIds]));
        }
        if (serviceCollisionIds.size > 0) {
          await tx
            .delete(beSpecialistServiceAvailability)
            .where(inArray(beSpecialistServiceAvailability.id, [...serviceCollisionIds]));
        }
        if (repointIds.beAppointments.length > 0) {
          await tx
            .update(beAppointments)
            .set({ specialistId: primaryId })
            .where(inArray(beAppointments.id, repointIds.beAppointments));
        }
        if (repointIds.beAvailabilityRules.length > 0) {
          await tx
            .update(beAvailabilityRules)
            .set({ specialistId: primaryId })
            .where(inArray(beAvailabilityRules.id, repointIds.beAvailabilityRules));
        }
        if (repointIds.beScheduleBlocks.length > 0) {
          await tx
            .update(beScheduleBlocks)
            .set({ specialistId: primaryId })
            .where(inArray(beScheduleBlocks.id, repointIds.beScheduleBlocks));
        }
        if (repointIds.beWorkingHours.length > 0) {
          await tx
            .update(beWorkingHours)
            .set({ specialistId: primaryId })
            .where(inArray(beWorkingHours.id, repointIds.beWorkingHours));
        }
        if (repointIds.beWorkingDays.length > 0) {
          await tx
            .update(beWorkingDays)
            .set({ specialistId: primaryId })
            .where(inArray(beWorkingDays.id, repointIds.beWorkingDays));
        }
        if (repointIds.beSpecialistLocations.length > 0) {
          await tx
            .update(beSpecialistLocations)
            .set({ specialistId: primaryId })
            .where(inArray(beSpecialistLocations.id, repointIds.beSpecialistLocations));
        }
        if (repointIds.beSpecialistRooms.length > 0) {
          await tx
            .update(beSpecialistRooms)
            .set({ specialistId: primaryId })
            .where(inArray(beSpecialistRooms.id, repointIds.beSpecialistRooms));
        }
        if (repointIds.beSpecialistServiceAvailability.length > 0) {
          await tx
            .update(beSpecialistServiceAvailability)
            .set({ specialistId: primaryId })
            .where(
              inArray(
                beSpecialistServiceAvailability.id,
                repointIds.beSpecialistServiceAvailability,
              ),
            );
        }
        if (repointIds.beOrganizationMembers.length > 0) {
          await tx
            .update(beOrganizationMembers)
            .set({ specialistId: primaryId })
            .where(inArray(beOrganizationMembers.id, repointIds.beOrganizationMembers));
        }
        if (externalMappingRows.length > 0) {
          await tx
            .update(beExternalEntityMappings)
            .set({ canonicalId: primaryId, updatedAt })
            .where(inArray(beExternalEntityMappings.id, ids(externalMappingRows)));
        }
        if (duplicateIds.length > 0) {
          await tx
            .update(beSpecialists)
            .set({ isActive: false, updatedAt })
            .where(inArray(beSpecialists.id, duplicateIds));
        }
        if (nullAppointmentRows.length > 0) {
          await tx
            .update(beAppointments)
            .set({ specialistId: primaryId, updatedAt })
            .where(inArray(beAppointments.id, ids(nullAppointmentRows)));
        }
      });
      transactionCommitted = true;

      const appliedArtifact: AuditArtifact = SUMMARY_ONLY
        ? { state: 'applied', mode: 'summary-only', stats }
        : {
            state: 'applied',
            mode: 'detailed',
            createdAt,
            appliedAt: new Date().toISOString(),
            stats,
            audit: detailedAudit,
          };
      createPrivateAuditArtifact(appliedAuditPath, appliedArtifact);

      if (!SUMMARY_ONLY) {
        console.log(`\nAudit log → ${appliedAuditPath}`);
      }
    }

    printSummary(stats);
    if (!COMMIT && !SUMMARY_ONLY) {
      console.log('\nDRY-RUN — изменений не вносилось. Повтори с --commit для записи.');
    }
  } catch (error) {
    if (SUMMARY_ONLY) {
      console.error(
        transactionCommitted
          ? 'FAILED after consolidation commit; private audit state requires operator review.'
          : 'FAILED; no consolidation result was committed.',
      );
    } else {
      console.error(
        transactionCommitted
          ? 'FAILED after consolidation commit; audit finalization failed:'
          : 'FAILED, rolled back:',
        error,
      );
    }
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? resolvePath(process.argv[1]) : null;
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main().then(() => {
    process.exit(process.exitCode ?? 0);
  });
}
