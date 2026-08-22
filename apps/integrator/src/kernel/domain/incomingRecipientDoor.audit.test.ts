/**
 * Опознание получателя во входящем событии — под ВСЕМИ тремя принципалами, которые ставят вебхуки.
 *
 * `handleIncomingEvent` читает получателя ровно в одном месте (`handleIncomingEvent.ts:122`,
 * `user.byIdentity`), но исполняется это место под тремя разными принципалами: их выбирает вебхук
 * тройкой `integrator` → `organization` → `bootstrap` (telegram/webhook.ts:372,377,378;
 * max/webhook.ts:311,316,317 и :403,407; vk/webhook.ts:62,64,65).
 *
 * Тест ставит под продуктовый вызов НАСТОЯЩИЙ слой порта (`integratorPortContextPrincipal`), а не
 * заглушку `DbPort`: именно он сопоставляет принципал + идентичность корня с объявленной
 * возможностью и отказывает, когда двери нет. Форма взята у соседа
 * `writePort.identityRootReachability.audit.test.ts` (D25), который сторожит тот же вопрос для
 * ПИСАТЕЛЕЙ.
 *
 * Что ловится: под дверью, которой нет, бросок уходит из `buildBaseContext` наверх — его не
 * перехватывает никто до `eventGateway` (index.ts:67), а тот отвечает `PIPELINE_FAILED`. Для
 * человека это значит: ни одного ответа на сообщение, а мессенджеру вебхук вернул 200 — повтора не
 * будет.
 */
import type { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult, IncomingEvent } from '../contracts/index.js';
import {
  runWithBootstrapPrincipal,
  runWithIntegratorPrincipal,
  runWithOrganizationPrincipal,
} from '../../infra/principal/organizationPrincipal.js';
import { createIntegratorPoolProvider } from '../../infra/db/integratorPoolProvider.js';
import type { IntegratorPortCapabilityDescriptor } from '../../infra/db/portContextRuntime.js';
import { integratorSqlFromPgText } from '../../infra/db/runIntegratorSql.js';
import { createDbReadPort } from '../../infra/db/readPort.js';
import { handleIncomingEvent } from './handleIncomingEvent.js';

const ORG = '00000000-0000-4000-8000-000000000abc';

/**
 * Дословно те дескрипторы, которые выпускает объявленная декларация для этого корня, плюс две
 * обычные реляционные возможности, которые вебхук-принципал выбрал бы иначе.
 * Источник истины: `deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql`.
 */
const capabilities: Record<string, IntegratorPortCapabilityDescriptor> = {
  request: {
    capabilityId: '00000000-0000-0000-0000-000000000103',
    targetRole: 'app_integrator_request',
    contextClass: 'integrator',
    purpose: 'relation',
  },
  tenant_service: {
    capabilityId: '00000000-0000-0000-0000-000000000105',
    targetRole: 'app_tenant_service',
    contextClass: 'tenant_service',
    purpose: 'relation',
  },
  resolver: {
    capabilityId: '00000000-0000-0000-0000-000000000104',
    targetRole: 'app_integrator_resolver',
    contextClass: 'integrator',
    purpose: 'relation',
  },
  channel_binding_identity_read: {
    capabilityId: 'd8d41661-b77c-51d9-a469-bd70e7d3fcd0',
    targetRole: 'app_integrator_request',
    contextClass: 'tenant_service',
    purpose: 'integrator.channel-binding-identity.read',
    functionIdentity: 'app.integrator_read_channel_binding_identity(text,text,text)',
  },
  channel_binding_identity_read_integrator_context: {
    capabilityId: '06d28c89-65a6-52cc-85cf-635f5c11b0de',
    targetRole: 'app_integrator_request',
    contextClass: 'integrator',
    purpose: 'integrator.channel-binding-identity.read',
    functionIdentity: 'app.integrator_read_channel_binding_identity(text,text,text)',
  },
};

type Harness = { db: DbPort; productQueries: string[] };

/** DbPort поверх настоящего port-context пула; фальшивый тут только физический клиент. */
function portContextHarness(row: Record<string, unknown>): Harness {
  const productQueries: string[] = [];
  const provider = createIntegratorPoolProvider({
    connectionString: 'postgresql://integrator/app',
    portContext: { pool: { connectionString: 'postgresql://integrator/app' }, capabilities },
    poolFactory: () => {
      const client = {
        query: async (queryConfig: unknown) => {
          const text =
            typeof queryConfig === 'string' ? queryConfig : (queryConfig as { text: string }).text;
          if (/app\.integrator_read_channel_binding_identity/.test(text)) {
            productQueries.push(text);
            return { rows: [row], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      } as unknown as PoolClient;
      return {
        connect: async () => client,
        on: () => undefined,
        end: async () => undefined,
      } as unknown as Pool;
    },
  });
  const drizzleDb = drizzle(provider);
  const db: DbPort = {
    async query<T>(text: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      const raw = (await drizzleDb.execute(integratorSqlFromPgText(text, params ?? []))) as {
        rows?: T[];
        rowCount?: number | null;
      };
      return {
        rows: raw.rows ?? [],
        ...(typeof raw.rowCount === 'number' ? { rowCount: raw.rowCount } : {}),
      };
    },
    async tx(): Promise<never> {
      throw new Error('the recipient read must not open a relation transaction');
    },
  };
  return { db, productQueries };
}

const IDENTITY_ROW = {
  platform_user_id: '00000000-0000-4000-8000-000000000778',
  external_id: '778',
  display_handle: '@handle',
  phone_normalized: '+79000000078',
};

function telegramEvent(): IncomingEvent {
  return {
    payload: { incoming: { channelId: '778' } },
    meta: {
      eventId: 'evt-recipient-door',
      correlationId: 'corr-recipient-door',
      source: 'telegram',
      userId: '778',
      receivedAt: '2026-08-22T00:00:00.000Z',
    },
  } as unknown as IncomingEvent;
}

async function recipientOf(db: DbPort): Promise<{ linkedPhone?: boolean; phoneNormalized?: string }> {
  const result = await handleIncomingEvent(telegramEvent(), { readPort: createDbReadPort({ db }) });
  return result.context.base;
}

describe('входящее событие: опознание получателя под каждым принципалом вебхука', () => {
  it('организационный принципал (telegram/webhook.ts:377) — получатель опознан', async () => {
    const { db, productQueries } = portContextHarness(IDENTITY_ROW);
    const base = await runWithOrganizationPrincipal(ORG, () => recipientOf(db));
    expect(productQueries).toHaveLength(1);
    expect(base.linkedPhone).toBe(true);
    expect(base.phoneNormalized).toBe('+79000000078');
  });

  it('интеграторский принципал (telegram/webhook.ts:372) — получатель опознан', async () => {
    const { db, productQueries } = portContextHarness(IDENTITY_ROW);
    const base = await runWithIntegratorPrincipal(
      { organizationId: ORG, integratorUserId: '42', source: 'telegram-webhook' },
      () => recipientOf(db),
    );
    expect(productQueries).toHaveLength(1);
    expect(base.linkedPhone).toBe(true);
    expect(base.phoneNormalized).toBe('+79000000078');
  });

  it('bootstrap-принципал (telegram/webhook.ts:378) — клиники нет, читать получателя нечем', async () => {
    const { db, productQueries } = portContextHarness(IDENTITY_ROW);
    const base = await runWithBootstrapPrincipal({ source: 'telegram-webhook:unresolved-org' }, () =>
      recipientOf(db),
    );
    expect(productQueries).toHaveLength(0);
    expect(base.linkedPhone).toBe(false);
  });
});
