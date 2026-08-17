#!/usr/bin/env tsx
/**
 * One-off: удаление ЗАПИСЕЙ служебных плейсхолдер-аккаунтов (НЕ аккаунтов!).
 *
 * Контекст: владелец создавал служебные «записи» под плейсхолдер-аккаунтами:
 *   - «БЛОК ОКНА» (тел. +70000000000) — ручная блокировка слота;
 *   - «Дмитрий Берсон» (тел. +79189000782) — свои тестовые брони.
 * Это не реальные пациенты — их брони мусорят историю и календарь. Удаляем ТОЛЬКО записи
 * (be_appointments + patient_bookings + appointment-маппинги), сами platform_users НЕ трогаем.
 *
 * ⚠ ЭТОТ СКРИПТ НЕ УДАЛЯЕТ НИ ОДНОГО АККАУНТА (platform_users). Только записи.
 *
 * Что удаляет (в одной транзакции при --commit):
 *   1. be_external_entity_mappings (entity_type='appointment') для целевых записей;
 *   2. be_appointments целевых (CASCADE снесёт audit-детей: events/history/reschedules/
 *      cancellations/staff_comments/form_submissions; payments/patient_bookings → SET NULL);
 *   3. patient_bookings проекции этих плейсхолдеров;
 *
 * Цель = записи, где platform_user_id принадлежит НЕ-admin плейсхолдеру с целевым телефоном,
 *   ИЛИ phone_normalized/contact_phone — целевой телефон. Admin-аккаунты исключены by design.
 *
 * Безопасность:
 *   - Dry-run по умолчанию; запись ТОЛЬКО с --commit (одна транзакция, ROLLBACK при ошибке).
 *   - Любой запуск разрешён только на loopback named DEV; TEST дополнительно требует
 *     --allow-test-target. DATABASE_URL и current_database() должны точно совпасть.
 *   - Идемпотентно: повторный прогон удаляет 0.
 *   - Жёсткая защита: target phones отдельно проверяются против admin principals, а каждый
 *     delete predicate исключает admin-owned booking независимо от предварительной выборки.
 *   - --summary-only не печатает id/имена/телефоны и не кладёт их в audit artifact.
 *   - Audit artifact создаётся с mode 0600 и fsync до destructive transaction; после успешного
 *     commit атомарно переводится из planned в applied.
 *
 * Запуск:
 *   set -a && source apps/webapp/.env.dev && set +a
 *   pnpm --dir apps/webapp run purge-placeholder-bookings              # dry-run
 *   pnpm --dir apps/webapp run purge-placeholder-bookings -- --commit
 *   pnpm --dir apps/webapp run purge-placeholder-bookings -- --summary-only
 *   pnpm --dir apps/webapp run purge-placeholder-bookings -- --summary-only --commit
 *   pnpm --dir apps/webapp run purge-placeholder-bookings -- --allow-test-target ... # only approved TEST
 */

import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, count, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import {
  beAppointments,
  beExternalEntityMappings,
  patientBookings,
  platformUsers,
} from '../db/schema';
import { assertAllowedPurgeDatabaseTarget } from './purge-placeholder-bookings-safety';

const args = new Set(process.argv.slice(2));
const COMMIT = args.has('--commit');
const SUMMARY_ONLY = args.has('--summary-only');
const ALLOW_TEST_TARGET = args.has('--allow-test-target');
// Owner-gated PROD cutover unlock (defaults OFF). Both are required together to relax the
// live-like-name refusal in the safety guard; see purge-placeholder-bookings-safety.ts.
const ALLOW_AUTHORIZED_PROD_TARGET = args.has('--allow-authorized-prod-target');
const AUTHORIZED_PROD_DATABASE = (() => {
  const prefix = '--authorized-prod-database=';
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
})();
const PHONES = ['+70000000000', '+79189000782'];

type CleanupStats = {
  be_appointments_to_delete: number;
  appointment_mappings_to_delete: number;
  patient_bookings_to_delete: number;
};

type DetailedAudit = {
  targetUsers: Array<{ id: string; name: string; phone: string | null }>;
  appointmentIds: string[];
};

type AuditArtifact = {
  state: 'planned' | 'applied';
  mode: 'detailed' | 'summary-only';
  createdAt: string;
  appliedAt?: string;
  stats: CleanupStats;
  audit?: DetailedAudit;
};

const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) {
  console.error('MISSING DATABASE_URL — сначала: set -a && source apps/webapp/.env.dev && set +a');
  process.exit(1);
}

function syncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writePrivateFile(path: string, contents: string, exclusive: boolean): void {
  const fd = openSync(path, exclusive ? 'wx' : 'w', 0o600);
  try {
    writeFileSync(fd, contents, { encoding: 'utf8' });
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600);
}

/** Creates a durable private artifact before the destructive transaction starts. */
function createPrivateAuditArtifact(path: string, artifact: AuditArtifact): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  writePrivateFile(path, `${JSON.stringify(artifact, null, 2)}\n`, true);
  syncDirectory(dir);
}

/** Replaces the planned artifact atomically after the DB transaction committed. */
function replacePrivateAuditArtifact(path: string, artifact: AuditArtifact): void {
  const dir = dirname(path);
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    writePrivateFile(tempPath, `${JSON.stringify(artifact, null, 2)}\n`, true);
    renameSync(tempPath, path);
    chmodSync(path, 0o600);
    syncDirectory(dir);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // The temporary file may already have been atomically renamed.
    }
    throw error;
  }
}

function printSummary(stats: CleanupStats): void {
  if (SUMMARY_ONLY) {
    console.log(
      JSON.stringify({
        mode: COMMIT ? 'commit' : 'dry-run',
        recordsOnly: true,
        stats,
      }),
    );
    return;
  }

  console.log('\n=== SUMMARY (records only; НЕ удаляются аккаунты) ===');
  console.table(stats);
}

async function main() {
  let transactionCommitted = false;

  try {
    // Refuse unsafe URL shape before initializing a DB client. current_database() is attested immediately after.
    const urlDatabase = decodeURIComponent(new URL(DATABASE_URL).pathname.replace(/^\/+/, ''));
    assertAllowedPurgeDatabaseTarget({
      databaseUrl: DATABASE_URL,
      currentDatabase: urlDatabase,
      allowTestTarget: ALLOW_TEST_TARGET,
      allowAuthorizedProdTarget: ALLOW_AUTHORIZED_PROD_TARGET,
      authorizedProdDatabase: AUTHORIZED_PROD_DATABASE,
    });
    const { getDrizzle } = await import('@/app-layer/db/drizzle');
    const db = getDrizzle();
    const databaseResult = await db.execute<{ database_name: string }>(
      sql`SELECT current_database()::text AS database_name`,
    );
    assertAllowedPurgeDatabaseTarget({
      databaseUrl: DATABASE_URL,
      currentDatabase: databaseResult.rows[0]?.database_name ?? '',
      allowTestTarget: ALLOW_TEST_TARGET,
      allowAuthorizedProdTarget: ALLOW_AUTHORIZED_PROD_TARGET,
      authorizedProdDatabase: AUTHORIZED_PROD_DATABASE,
    });

    // Explicitly reject the target phones when any of them belongs to an admin principal.
    const targetPhoneAdminUsers = await db
      .select({ id: platformUsers.id })
      .from(platformUsers)
      .where(and(inArray(platformUsers.phoneNormalized, PHONES), eq(platformUsers.role, 'admin')));
    if (targetPhoneAdminUsers.length > 0) {
      throw new Error('ABORT: target phone belongs to an admin principal');
    }

    // target placeholder users (НЕ-admin, с целевым телефоном) — только для матчинга записей
    const users = await db
      .select({
        id: platformUsers.id,
        displayName: platformUsers.displayName,
        phoneNormalized: platformUsers.phoneNormalized,
        role: platformUsers.role,
      })
      .from(platformUsers)
      .where(and(inArray(platformUsers.phoneNormalized, PHONES), ne(platformUsers.role, 'admin')));

    const userIds = users.map((user) => user.id);
    const detailedAudit: DetailedAudit = {
      targetUsers: users.map((user) => ({
        id: user.id,
        name: user.displayName,
        phone: user.phoneNormalized,
      })),
      appointmentIds: [],
    };

    if (!SUMMARY_ONLY) {
      console.log('\n=== ЦЕЛЕВЫЕ ПЛЕЙСХОЛДЕР-АККАУНТЫ (НЕ удаляются, только их записи) ===');
      for (const user of users) {
        console.log(
          `  ${user.id}  ${user.displayName}  ${user.phoneNormalized}  role=${user.role}`,
        );
      }
    }

    // защита: ни один целевой не должен быть admin
    const adminUsers =
      userIds.length === 0
        ? []
        : await db
            .select({ id: platformUsers.id })
            .from(platformUsers)
            .where(and(inArray(platformUsers.id, userIds), eq(platformUsers.role, 'admin')));
    if (adminUsers.length > 0) {
      if (SUMMARY_ONLY) {
        throw new Error('ABORT: admin guard rejected the cleanup target');
      }
      throw new Error(
        `ABORT: среди целевых оказался admin: ${adminUsers.map((user) => user.id).join(',')}`,
      );
    }

    const appointmentTarget =
      userIds.length > 0
        ? or(
            inArray(beAppointments.platformUserId, userIds),
            inArray(beAppointments.phoneNormalized, PHONES),
          )
        : inArray(beAppointments.phoneNormalized, PHONES);
    const patientBookingTarget =
      userIds.length > 0
        ? or(
            inArray(patientBookings.platformUserId, userIds),
            inArray(patientBookings.contactPhone, PHONES),
          )
        : inArray(patientBookings.contactPhone, PHONES);
    // The owner predicates remain protected even if a target phone/user changes after preflight.
    const appointmentWhere = and(
      appointmentTarget,
      or(
        isNull(beAppointments.platformUserId),
        notInArray(
          beAppointments.platformUserId,
          db
            .select({ id: platformUsers.id })
            .from(platformUsers)
            .where(eq(platformUsers.role, 'admin')),
        ),
      ),
    );
    const patientBookingWhere = and(
      patientBookingTarget,
      or(
        isNull(patientBookings.platformUserId),
        notInArray(
          patientBookings.platformUserId,
          db
            .select({ id: platformUsers.id })
            .from(platformUsers)
            .where(eq(platformUsers.role, 'admin')),
        ),
      ),
    );
    const appointmentRows = await db
      .select({ id: beAppointments.id })
      .from(beAppointments)
      .where(appointmentWhere);
    const appointmentIds = appointmentRows.map((row) => row.id);
    detailedAudit.appointmentIds = appointmentIds;

    const [mappingCountRow, patientBookingCountRow] = await Promise.all([
      appointmentIds.length === 0
        ? Promise.resolve({ value: 0 })
        : db
            .select({ value: count() })
            .from(beExternalEntityMappings)
            .where(
              and(
                eq(beExternalEntityMappings.entityType, 'appointment'),
                inArray(beExternalEntityMappings.canonicalId, appointmentIds),
              ),
            )
            .then((rows) => rows[0] ?? { value: 0 }),
      db
        .select({ value: count() })
        .from(patientBookings)
        .where(patientBookingWhere)
        .then((rows) => rows[0] ?? { value: 0 }),
    ]);

    const stats: CleanupStats = {
      be_appointments_to_delete: appointmentIds.length,
      appointment_mappings_to_delete: Number(mappingCountRow.value),
      patient_bookings_to_delete: Number(patientBookingCountRow.value),
    };

    let auditPath: string | null = null;
    let plannedArtifact: AuditArtifact | null = null;

    if (COMMIT) {
      const createdAt = new Date().toISOString();
      const stamp = createdAt.replace(/[:.]/g, '-');
      auditPath = resolvePath(process.cwd(), `../../.tmp/placeholder-purge/applied-${stamp}.json`);
      plannedArtifact = {
        state: 'planned',
        mode: SUMMARY_ONLY ? 'summary-only' : 'detailed',
        createdAt,
        stats,
        ...(SUMMARY_ONLY ? {} : { audit: detailedAudit }),
      };

      // Fail closed: no DELETE starts unless the pre-commit artifact is already durable and private.
      createPrivateAuditArtifact(auditPath, plannedArtifact);

      await db.transaction(async (tx) => {
        const lockedTargetPhoneUsers = await tx
          .select({ role: platformUsers.role })
          .from(platformUsers)
          .where(inArray(platformUsers.phoneNormalized, PHONES))
          .for('update');
        if (lockedTargetPhoneUsers.some((user) => user.role === 'admin')) {
          throw new Error('ABORT: target phone became an admin principal');
        }
        const lockedAppointmentRows = await tx
          .select({ id: beAppointments.id })
          .from(beAppointments)
          .where(appointmentWhere)
          .for('update');
        const lockedAppointmentIds = lockedAppointmentRows.map((row) => row.id);
        const previewIds = [...appointmentIds].sort();
        const transactionIds = [...lockedAppointmentIds].sort();
        if (
          previewIds.length !== transactionIds.length ||
          previewIds.some((id, index) => id !== transactionIds[index])
        ) {
          throw new Error('ABORT: appointment target set changed after preview');
        }
        if (lockedAppointmentIds.length > 0) {
          await tx
            .delete(beExternalEntityMappings)
            .where(
              and(
                eq(beExternalEntityMappings.entityType, 'appointment'),
                inArray(beExternalEntityMappings.canonicalId, lockedAppointmentIds),
              ),
            );
        }
        await tx.delete(beAppointments).where(appointmentWhere);
        await tx.delete(patientBookings).where(patientBookingWhere);
      });
      transactionCommitted = true;

      replacePrivateAuditArtifact(auditPath, {
        ...plannedArtifact,
        state: 'applied',
        appliedAt: new Date().toISOString(),
      });

      if (!SUMMARY_ONLY) {
        console.log(`\nAudit log → ${auditPath}`);
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
          ? 'FAILED after cleanup commit; private audit state requires operator review.'
          : 'FAILED; no cleanup result was committed.',
      );
    } else {
      console.error(
        transactionCommitted
          ? 'FAILED after cleanup commit; audit finalization failed:'
          : 'FAILED, rolled back:',
        error,
      );
    }
    process.exitCode = 1;
  }
}

void main().then(() => {
  // getDrizzle owns the sole DB pool; one-off scripts terminate after all awaited work is complete.
  process.exit(process.exitCode ?? 0);
});
