/**
 * D25 independent audit (auditor-live, 2026-08-22) — acceptance tests for the ONE thing the
 * candidate's own suite cannot see: whether the two exact named roots are reachable under the
 * principals the Telegram/MAX webhook actually installs.
 *
 * `bootstrapChannelIdentityRoot.unit.test.ts` drives `createDbWritePort` with a hand-written
 * `DbPort` whose `query()` returns a canned row. That fake sits BELOW the layer under test: in the
 * real runtime (`DB_PRINCIPAL_CONTEXT_MODE=port-context`, DEV/TEST/PROD) every `db.query` first goes
 * through `integratorPortContextPrincipal`, which maps the current principal + named-root identity to
 * a declared capability and refuses when no capability matches. These tests put that real layer back
 * under the product call, using the capability descriptors actually declared for the two roots.
 *
 * Named failures these catch:
 *  1. A Telegram `/start` from a person whose clinic is already resolved (`runWithIntegratorPrincipal`
 *     — telegram/webhook.ts:372, the common case) → `user.upsert` throws instead of writing the
 *     channel identity, so the login link is never delivered.
 *  2. The second webhook (shared contact) for the same person → `user.phone.link` never binds and the
 *     refusal is reported as `phoneLinkIndeterminate` / `db_transient_failure`, i.e. a permanent
 *     configuration refusal disguised as a retryable one.
 *  3. The same for the organization-only principal (telegram/webhook.ts:377).
 */
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import {
  runWithBootstrapPrincipal,
  runWithIntegratorPrincipal,
  runWithOrganizationPrincipal,
} from '../principal/organizationPrincipal.js';
import { createIntegratorPoolProvider } from './integratorPoolProvider.js';
import type { IntegratorPortCapabilityDescriptor } from './portContextRuntime.js';
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
  integrator_bootstrap_phone_bind: {
    capabilityId: 'cc7d32ed-5366-5865-8113-109399bdb0fb',
    targetRole: 'app_integrator_resolver',
    contextClass: 'integrator',
    purpose: 'integrator.bootstrap-phone-bind',
    functionIdentity: 'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)',
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
        query: async (text: string) => {
          if (/app\.integrator_(upsert_channel_identity|bind_bootstrap_channel_phone)/.test(text)) {
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
  const db: DbPort = {
    async query<T>(text: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      return (await (provider as unknown as { query: (t: string, p?: unknown[]) => unknown }).query(
        text,
        params,
      )) as DbQueryResult<T>;
    },
    async tx(): Promise<never> {
      throw new Error('user.upsert / user.phone.link must not open a relation transaction');
    },
  };
  return { db, productQueries };
}

const IDENTITY_ROW = {
  platform_user_id: '00000000-0000-4000-8000-000000000778',
  account_created: false,
  channel_binding_inserted: true,
};
const BIND_OK_ROW = {
  platform_user_id: '00000000-0000-4000-8000-000000000778',
  applied: true,
  failure_code: null,
};

describe('D25 audit — identity/phone roots must be reachable under the webhook principals', () => {
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

  it('user.upsert writes the channel identity when the clinic AND integrator user are resolved', async () => {
    const { db, productQueries } = portContextHarness(IDENTITY_ROW);
    const port = createDbWritePort({ db });

    await runWithIntegratorPrincipal(
      { organizationId: ORG, integratorUserId: '42', source: 'telegram-webhook' },
      () =>
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

  it('user.phone.link binds the confirmed contact when the clinic AND integrator user are resolved', async () => {
    const { db, productQueries } = portContextHarness(BIND_OK_ROW);
    const port = createDbWritePort({ db, authChannelPolicy: async () => true });

    const result = await runWithIntegratorPrincipal(
      { organizationId: ORG, integratorUserId: '42', source: 'telegram-webhook' },
      () =>
        port.writeDb({
          type: 'user.phone.link',
          params: { resource: 'telegram', channelUserId: '778', phoneNormalized: '+79000000078' },
        }),
    );

    expect(result).toEqual({ userPhoneLinkApplied: true });
    expect(productQueries).toHaveLength(1);
    expect(productQueries[0]).toContain('app.integrator_bind_bootstrap_channel_phone');
  });

  it('user.phone.link binds the confirmed contact when only the clinic is resolved', async () => {
    const { db, productQueries } = portContextHarness(BIND_OK_ROW);
    const port = createDbWritePort({ db, authChannelPolicy: async () => true });

    const result = await runWithOrganizationPrincipal(ORG, () =>
      port.writeDb({
        type: 'user.phone.link',
        params: { resource: 'telegram', channelUserId: '778', phoneNormalized: '+79000000078' },
      }),
    );

    expect(result).toEqual({ userPhoneLinkApplied: true });
    expect(productQueries).toHaveLength(1);
    expect(productQueries[0]).toContain('app.integrator_bind_bootstrap_channel_phone');
  });
});
