/**
 * D25 independent audit (auditor-live, 2026-08-22) — acceptance tests for the ONE thing the
 * candidate's own suite cannot see: whether the named root is reachable under the principals the
 * Telegram/MAX webhook actually installs.
 *
 * `bootstrapChannelIdentityRoot.unit.test.ts` drives `createDbWritePort` with a hand-written
 * `DbPort` whose `query()` returns a canned row. That fake sits BELOW the layer under test: in the
 * real runtime (`DB_PRINCIPAL_CONTEXT_MODE=port-context`, DEV/TEST/PROD) every `db.query` first goes
 * through `integratorPortContextPrincipal`, which maps the current principal + named-root identity to
 * a declared capability and refuses when no capability matches. These tests put that real layer back
 * under the product call, using the capability descriptor actually declared for the root.
 *
 * Named failures these catch:
 *  1. A Telegram `/start` from a person whose clinic is already resolved (the organization
 *     principal telegram/webhook.ts installs, the common case) → `user.upsert` throws instead of
 *     writing the channel identity, so the login link is never delivered.
 *  2. The same for a `/start` whose clinic could not be resolved, under the bootstrap principal.
 *
 * `user.phone.link` and its named root `app.integrator_bind_bootstrap_channel_phone` were removed
 * (identity cleanup 2026-08-26): webapp owns the confirmed-phone write end-to-end
 * (`completePhoneMessengerBindFromIntegrator` / `confirmPhoneAuth`), integrator no longer writes
 * contact/merge state under any name.
 */
import type { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import {
  runWithBootstrapPrincipal,
  runWithOrganizationPrincipal,
} from '../principal/organizationPrincipal.js';
import { createIntegratorPoolProvider } from './integratorPoolProvider.js';
import type { IntegratorPortCapabilityDescriptor } from './portContextRuntime.js';
import { integratorSqlFromPgText } from './runIntegratorSql.js';
import { createDbWritePort } from './writePort.js';

const ORG = '00000000-0000-4000-8000-000000000abc';

/**
 * Exactly the descriptors the deployed declaration emits for these two roots, plus the two ordinary
 * relation capabilities a webhook principal would otherwise select.
 * Source of truth: `deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql`.
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
  integrator_channel_identity_upsert: {
    capabilityId: 'e75f617d-2e5a-565c-91fe-95a163c909e6',
    targetRole: 'app_integrator_resolver',
    contextClass: 'integrator',
    purpose: 'integrator.channel-identity.upsert',
    functionIdentity: 'app.integrator_upsert_channel_identity(text,text,text)',
  },
};

type Harness = { db: DbPort; productQueries: string[] };

/** A DbPort backed by the real port-context pool; the physical client is faked, the layer is not. */
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
          if (/app\.integrator_upsert_channel_identity/.test(text)) {
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
  // The app's own Drizzle bridge (`runIntegratorSql.integratorSqlFromPgText` +
  // `drizzle(...).execute()`) — the same door production `runIntegratorSql`/`runIntegratorNamedRoot`
  // use to turn `$1..$n` query text back into a fragment. `provider` itself is untouched: it stays
  // the real port-context proxy from `createIntegratorPoolProvider`, so its own `query` closure (the
  // layer under test, `integratorPortContextPrincipal`) still runs underneath every call — Drizzle
  // only compiles the SQL text before handing it to that same `provider.query`.
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
      throw new Error('user.upsert must not open a relation transaction');
    },
  };
  return { db, productQueries };
}

const IDENTITY_ROW = {
  platform_user_id: '00000000-0000-4000-8000-000000000778',
  account_created: false,
  channel_binding_inserted: true,
};

describe('D25 audit — identity root must be reachable under the webhook principals', () => {
  // Positive control: the same harness under the ONE principal the roots are declared for. If this
  // ever fails, the harness is wrong and the four cases below prove nothing.
  it('control: user.upsert writes the channel identity for an unresolved-org (bootstrap) webhook', async () => {
    const { db, productQueries } = portContextHarness(IDENTITY_ROW);
    const port = createDbWritePort({ db });

    await runWithBootstrapPrincipal({ source: 'telegram-webhook:unresolved-org' }, () =>
      port.writeDb({
        type: 'user.upsert',
        params: { resource: 'telegram', externalId: '778', username: '@handle' },
      }),
    );

    expect(productQueries).toHaveLength(1);
    expect(productQueries[0]).toContain('app.integrator_upsert_channel_identity');
  });

  it('user.upsert writes the channel identity when only the clinic is resolved', async () => {
    const { db, productQueries } = portContextHarness(IDENTITY_ROW);
    const port = createDbWritePort({ db });

    await runWithOrganizationPrincipal(ORG, () =>
      port.writeDb({
        type: 'user.upsert',
        params: { resource: 'telegram', externalId: '778', username: '@handle' },
      }),
    );

    expect(productQueries).toHaveLength(1);
    expect(productQueries[0]).toContain('app.integrator_upsert_channel_identity');
  });
});
