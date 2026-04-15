import type { Pool } from "pg";
import { getIntegratorPoolForPurge } from "@/infra/platformUserFullPurge";

const NUMERIC_ID = /^\d+$/;

export type MergePreviewIntegratorUserPresence = {
  target: {
    webappIntegratorUserId: string | null;
    /** Строка `users` в БД integrator; `null` если id в webapp нет, нет доступа к БД или ошибка запроса. */
    rowExistsInIntegratorDb: boolean | null;
  };
  duplicate: {
    webappIntegratorUserId: string | null;
    rowExistsInIntegratorDb: boolean | null;
  };
  /** `ok` — проверка выполнена для всех непустых id; иначе причина пропуска/сбоя. */
  checkStatus: "ok" | "skipped_no_integrator_db" | "query_failed";
};

function normalizeIntegratorUserId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === "" || !NUMERIC_ID.test(t)) return null;
  try {
    return String(BigInt(t));
  } catch {
    return null;
  }
}

async function resolveWithPool(
  pool: Pick<Pool, "query"> | null,
  targetRaw: string | null | undefined,
  duplicateRaw: string | null | undefined,
  noPoolStatus: MergePreviewIntegratorUserPresence["checkStatus"],
): Promise<MergePreviewIntegratorUserPresence> {
  const target = normalizeIntegratorUserId(targetRaw ?? null);
  const duplicate = normalizeIntegratorUserId(duplicateRaw ?? null);

  if (!pool) {
    return {
      target: { webappIntegratorUserId: target, rowExistsInIntegratorDb: null },
      duplicate: { webappIntegratorUserId: duplicate, rowExistsInIntegratorDb: null },
      checkStatus: noPoolStatus,
    };
  }

  const ids = [...new Set([target, duplicate].filter((x): x is string => x != null))];
  if (ids.length === 0) {
    return {
      target: { webappIntegratorUserId: null, rowExistsInIntegratorDb: null },
      duplicate: { webappIntegratorUserId: null, rowExistsInIntegratorDb: null },
      checkStatus: "ok",
    };
  }

  try {
    const res = await pool.query<{ id: string }>(
      `SELECT id::text AS id FROM users WHERE id = ANY($1::bigint[])`,
      [ids],
    );
    const found = new Set(res.rows.map((r) => String(BigInt(r.id))));
    const exists = (id: string | null): boolean | null => {
      if (id == null) return null;
      return found.has(id);
    };
    return {
      target: { webappIntegratorUserId: target, rowExistsInIntegratorDb: exists(target) },
      duplicate: { webappIntegratorUserId: duplicate, rowExistsInIntegratorDb: exists(duplicate) },
      checkStatus: "ok",
    };
  } catch {
    return {
      target: { webappIntegratorUserId: target, rowExistsInIntegratorDb: null },
      duplicate: { webappIntegratorUserId: duplicate, rowExistsInIntegratorDb: null },
      checkStatus: "query_failed",
    };
  }
}

/**
 * Для merge-preview: есть ли строка `integrator.users` с id = platform_users.integrator_user_id.
 * `getIntegratorPoolForPurge()` использует те же env, что purge, **и** при unified PostgreSQL — fallback на
 * `DATABASE_URL` с `search_path=integrator,public`, так что `FROM users` резолвится в `integrator.users`.
 * Если ни одного URL нет — `skipped_no_integrator_db`.
 */
export async function resolveMergePreviewIntegratorUserPresence(params: {
  targetIntegratorUserId: string | null | undefined;
  duplicateIntegratorUserId: string | null | undefined;
}): Promise<MergePreviewIntegratorUserPresence> {
  return resolveWithPool(
    getIntegratorPoolForPurge(),
    params.targetIntegratorUserId,
    params.duplicateIntegratorUserId,
    "skipped_no_integrator_db",
  );
}

/** Тесты: подмена pool. */
export async function resolveMergePreviewIntegratorUserPresenceForTest(
  pool: Pick<Pool, "query"> | null,
  params: {
    targetIntegratorUserId: string | null | undefined;
    duplicateIntegratorUserId: string | null | undefined;
  },
): Promise<MergePreviewIntegratorUserPresence> {
  return resolveWithPool(pool, params.targetIntegratorUserId, params.duplicateIntegratorUserId, "skipped_no_integrator_db");
}
