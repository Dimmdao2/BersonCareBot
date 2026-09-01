import { beforeEach, describe, expect, it, vi } from 'vitest';

const reportSaasIsolationEventBestEffort = vi.fn(async () => {});

vi.mock('@/infra/saasIsolationReporterRuntime', () => ({
  reportSaasIsolationEventBestEffort: (...args: unknown[]) =>
    reportSaasIsolationEventBestEffort(...(args as [])),
}));
vi.mock('@/infra/db/saasIsolationOperationContext', () => ({
  getCurrentWebappDbOperationFamily: () => 'webapp_db_request',
}));

import { reportDbQueryFailure } from '@/infra/db/saasIsolationDbFailureReporting';

describe('webapp DB door isolation telemetry', () => {
  beforeEach(() => {
    reportSaasIsolationEventBestEffort.mockClear();
  });

  it('records a wall denial no rule recognizes instead of dropping it', async () => {
    // A real PostgreSQL permission failure whose message none of the local patterns match
    // (PostgreSQL names the relation kind: "view", "materialized view", "foreign table", ...).
    // The receiving writer accepts `unclassified_background_operation` for this exact source;
    // dropping it here makes a failing tenant wall invisible in operator diagnostics.
    await reportDbQueryFailure(
      Object.assign(new Error('permission denied for view v_patient_bookings'), { code: '42501' }),
    );

    expect(reportSaasIsolationEventBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        eventClass: 'unclassified_background_operation',
        sourceService: 'webapp',
      }),
    );
  });

  it('leaves ordinary product failures outside the isolation surface', async () => {
    await reportDbQueryFailure(new Error('connection terminated unexpectedly'));

    expect(reportSaasIsolationEventBestEffort).not.toHaveBeenCalled();
  });
});
