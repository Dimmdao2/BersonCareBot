import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  integratorPortContextPrincipal,
  type IntegratorPortCapabilityDescriptor,
} from './portContextRuntime.js';

const fakes = vi.hoisted(() => ({
  captureRelationPrincipal: vi.fn(),
  captureNamedPrincipal: vi.fn(),
  relationExecute: vi.fn(),
  relationCheckouts: vi.fn(),
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: () => ({
    execute: fakes.relationExecute,
  }),
}));

vi.mock('./client.js', () => {
  const port: DbPort = {
    query: async <T>() => {
      fakes.captureNamedPrincipal();
      return { rows: [] as T[] };
    },
    tx: async <T>(fn: (db: DbPort) => Promise<T>) => fn(port),
  };
  return {
    db: {},
    createDbPort: () => port,
  };
});

vi.mock('./withClient.js', () => ({
  withIntegratorPoolClient: async (_pool: unknown, fn: (client: object) => Promise<unknown>) => {
    fakes.relationCheckouts();
    return fn({});
  },
}));

import {
  assertDeliveryWorkerPoolReady,
  assertSchedulerPoolReady,
} from './operationalPoolReadiness.js';

const capabilities: Record<string, IntegratorPortCapabilityDescriptor> = {
  delivery: {
    capabilityId: '10000000-0000-4000-8000-000000000001',
    targetRole: 'app_operational_delivery_worker',
    contextClass: 'service',
    purpose: 'relation',
    runtimeSources: ['worker:outgoing-delivery-tick'],
  },
  scheduler: {
    capabilityId: '10000000-0000-4000-8000-000000000002',
    targetRole: 'app_operational_scheduler',
    contextClass: 'service',
    purpose: 'relation',
    runtimeSources: ['scheduler:handle-tick-event'],
  },
  resolve_outgoing_delivery_scope: {
    capabilityId: '10000000-0000-4000-8000-000000000003',
    targetRole: 'app_operational_delivery_worker',
    contextClass: 'service',
    purpose: 'delivery.resolve-scope',
    functionIdentity: 'app.resolve_outgoing_delivery_scope(uuid)',
  },
  operator_incident_alert_already_sent: {
    capabilityId: '10000000-0000-4000-8000-000000000004',
    targetRole: 'app_operational_delivery_worker',
    contextClass: 'service',
    purpose: 'delivery.incident-alert-status',
    functionIdentity: 'app.operator_incident_alert_already_sent(uuid)',
  },
  list_scheduler_reminder_organization_ids: {
    capabilityId: '10000000-0000-4000-8000-000000000005',
    targetRole: 'app_operational_scheduler',
    contextClass: 'service',
    purpose: 'scheduler.reminder-organizations',
    functionIdentity: 'app.list_scheduler_reminder_organization_ids()',
  },
};

describe('operational pool readiness port context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DB_PRINCIPAL_CONTEXT_MODE', 'port-context');
    fakes.captureRelationPrincipal.mockImplementation(() =>
      integratorPortContextPrincipal(getCurrentDbPrincipal(), capabilities),
    );
    fakes.captureNamedPrincipal.mockImplementation(() =>
      integratorPortContextPrincipal(getCurrentDbPrincipal(), capabilities),
    );
    fakes.relationExecute.mockImplementation(() => {
      fakes.captureRelationPrincipal();
      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('checks worker relations separately, then starts each named root with its exact descriptor', async () => {
    await expect(assertDeliveryWorkerPoolReady()).resolves.toBeUndefined();

    expect(fakes.relationCheckouts).toHaveBeenCalledTimes(1);
    const relationPrincipals = fakes.captureRelationPrincipal.mock.results.map(
      (result) => result.value,
    );
    expect(relationPrincipals).not.toHaveLength(0);
    expect(relationPrincipals).toEqual(
      relationPrincipals.map(() =>
        expect.objectContaining({ purpose: 'relation', targetRole: 'app_operational_delivery_worker' }),
      ),
    );
    expect(relationPrincipals.every((principal) => principal.functionIdentity === undefined)).toBe(
      true,
    );

    expect(fakes.captureNamedPrincipal.mock.results.map((result) => result.value)).toEqual([
      expect.objectContaining({
        purpose: 'delivery.resolve-scope',
        functionIdentity: 'app.resolve_outgoing_delivery_scope(uuid)',
        targetRole: 'app_operational_delivery_worker',
      }),
      expect.objectContaining({
        purpose: 'delivery.incident-alert-status',
        functionIdentity: 'app.operator_incident_alert_already_sent(uuid)',
        targetRole: 'app_operational_delivery_worker',
      }),
    ]);
  });

  it('checks the scheduler capability, then starts discovery with its exact descriptor', async () => {
    await expect(assertSchedulerPoolReady()).resolves.toBeUndefined();

    expect(fakes.relationCheckouts).toHaveBeenCalledTimes(1);
    const relationPrincipals = fakes.captureRelationPrincipal.mock.results.map(
      (result) => result.value,
    );
    expect(relationPrincipals).not.toHaveLength(0);
    expect(relationPrincipals).toEqual(
      relationPrincipals.map(() =>
        expect.objectContaining({ purpose: 'relation', targetRole: 'app_operational_scheduler' }),
      ),
    );
    expect(relationPrincipals.every((principal) => principal.functionIdentity === undefined)).toBe(
      true,
    );
    expect(fakes.captureNamedPrincipal.mock.results.map((result) => result.value)).toEqual([
      expect.objectContaining({
        purpose: 'scheduler.reminder-organizations',
        functionIdentity: 'app.list_scheduler_reminder_organization_ids()',
        targetRole: 'app_operational_scheduler',
        typedArgs: [],
      }),
    ]);
  });
});
