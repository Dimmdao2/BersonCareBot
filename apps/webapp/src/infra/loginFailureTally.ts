import { sql } from 'drizzle-orm';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { logger } from '@/infra/logging/logger';

const RECORD_LOGIN_FAILURE_ROOT = 'app.record_login_failure(uuid,text,text,text)';

/** Что именно не подошло. Два числа держатся врозь: см. `LoginDevicesCard`. */
export type LoginFailureKind = 'password' | 'second_factor';

export type LoginFailureRecord = {
  userId: string;
  /** Метка устройства, если браузер её носит. Новую здесь не заводим — её даёт только успешный вход. */
  deviceKey: string | null;
  sourceIp: string | null;
  kind: LoginFailureKind;
};

/**
 * Прибавляет одну неудачную попытку к итогу, который заморозится в следующий успешный вход.
 *
 * Отказ записи НАМЕРЕННО не роняет ответ маршрута — ровно по той же причине, по которой не роняет его
 * запись журнала входов: человеку, который ошибся паролем, полагается обычный ответ «неверно», а не
 * пятисотка из-за нашей телеметрии. Молчанием это не становится: отказ уходит в лог.
 */
export async function recordLoginFailure(input: LoginFailureRecord): Promise<void> {
  try {
    await runWithDbBootstrapPrincipal({ source: 'login-failure/record' }, () =>
      runWebappNamedRoot(
        getWebappSqlDb(),
        RECORD_LOGIN_FAILURE_ROOT,
        [input.userId, input.deviceKey, input.sourceIp, input.kind],
        sql`SELECT app.record_login_failure(
          ${input.userId}::uuid,
          ${input.deviceKey}::text,
          ${input.sourceIp}::text,
          ${input.kind}::text
        )`,
      ),
    );
  } catch (err) {
    // `reason` дублирует текст ошибки строкой намеренно: логгер сериализует `err` как
    // `{"type":"Error"}` и текст теряет, из-за чего отказ виден в журнале, но неразбираем.
    logger.error(
      { err, reason: String(err), kind: input.kind },
      'failed sign-in attempt was not counted',
    );
  }
}
