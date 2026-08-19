/**
 * Живое доказательство против НАСТОЯЩЕЙ базы, opt-in (в CI не идёт).
 *
 * Что здесь доказывается и почему это нельзя доказать выше по стеку: то, что публичная визитка
 * достижима ТОЛЬКО через объявленный корень. Утверждение про привилегии не проверяется ни одним
 * юнит-тестом по построению — его нельзя подделать моком, оно живёт в каталоге базы.
 *
 * Запуск:
 *   USE_REAL_DATABASE=1 RUN_CLINIC_PUBLIC_CARD_DB=1 \
 *   pnpm exec vitest run src/infra/repos/clinicPublicCard.devDbProof.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolConfig } from 'pg';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { createWebappPortContextRuntimeConfig } from '@/infra/db/portContextRuntime';
import { getWebappSqlFromPgClient, type WebappSqlExecutor } from '@/infra/db/runWebappSql';

const READ_ROOT = 'app.read_public_clinic_card(text)';
const SAVE_ROOT = 'app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean)';

function proofPoolConfig(): PoolConfig | null {
  try {
    return createWebappPortContextRuntimeConfig(process.env).patient;
  } catch {
    return null;
  }
}

const POOL_CONFIG = proofPoolConfig();
const enabled =
  process.env.RUN_CLINIC_PUBLIC_CARD_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  POOL_CONFIG !== null;

function pgCause(error: unknown): { code?: string; message?: string } {
  const cause = (error as { cause?: unknown }).cause;
  return (cause ?? error) as { code?: string; message?: string };
}

async function rejection(promise: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try {
    await promise;
  } catch (error) {
    return pgCause(error);
  }
  throw new Error('expected the query to be refused, it succeeded');
}

describe.skipIf(!enabled)('публичная визитка против настоящей базы (opt-in)', () => {
  const pool = new pg.Pool({ ...(POOL_CONFIG as PoolConfig), max: 2 });
  let client: pg.PoolClient;
  let db: WebappSqlExecutor;

  beforeAll(async () => {
    client = await pool.connect();
    db = getWebappSqlFromPgClient(client);
    const row = await db.execute(sql`SELECT current_database() AS n`);
    const name = (row.rows as { n: string }[])[0]?.n ?? '';
    if (name !== 'bcb_webapp_dev') {
      throw new Error(`refusing: current_database="${name}" — expected the dev DB.`);
    }
  });

  afterAll(async () => {
    client?.release();
    await pool.end();
  });

  it('анонимная роль не читает проекцию напрямую — корень остаётся единственной дверью', async () => {
    await db.execute(sql`BEGIN`);
    try {
      await db.execute(sql`SET LOCAL ROLE app_pre_session`);
      const refusal = await rejection(
        db.execute(sql`SELECT count(*) FROM public.clinic_public_directory_entries`),
      );
      expect(refusal.code).toBe('42501');
    } finally {
      await db.execute(sql`ROLLBACK`);
    }
  });

  it('обе двери объявлены, принадлежат своему шву и исполняются только своей ролью', async () => {
    const row = await db.execute(sql`
      SELECT p.oid::regprocedure::text AS identity,
             pg_catalog.pg_get_userbyid(p.proowner) AS owner,
             p.prosecdef AS security_definer,
             pg_catalog.has_function_privilege('app_pre_session', p.oid, 'EXECUTE') AS anon_may,
             pg_catalog.has_function_privilege('app_staff', p.oid, 'EXECUTE') AS staff_may
        FROM pg_catalog.pg_proc AS p
       WHERE p.oid IN (${READ_ROOT}::regprocedure, ${SAVE_ROOT}::regprocedure)`);
    const rows = row.rows as {
      identity: string;
      owner: string;
      security_definer: boolean;
      anon_may: boolean;
      staff_may: boolean;
    }[];
    expect(rows).toHaveLength(2);
    for (const fn of rows) {
      expect(fn.owner).toBe('app_seam_public_slug_owner');
      expect(fn.security_definer).toBe(true);
    }
    const read = rows.find((fn) => fn.identity.startsWith('app.read_public_clinic_card'));
    const save = rows.find((fn) => fn.identity.startsWith('app.save_public_clinic_card'));
    // Читает аноним, пишет персонал. Пересечения быть не должно ни в одну сторону.
    expect(read?.anon_may).toBe(true);
    expect(save?.anon_may).toBe(false);
    expect(save?.staff_may).toBe(true);
  });

  /* ⛔ НЕ ПРОВЕРЯЕТСЯ ЗДЕСЬ, и это честнее, чем зелёный тест не о том. Поколоночные гранты роли
     на проекцию проверить этим соединением нельзя: `has_column_privilege` требует разрешить имя
     отношения, а пациентскому логину USAGE на схему `public` не выдан (42501 — ровно та стена,
     ради которой корень и существует). Само утверждение при этом не остаётся без гейта: набор
     грантов сверяется побайтно `generate-cli --check` и переписью функций. */
});
