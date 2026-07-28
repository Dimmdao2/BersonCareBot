import { describe, expect, it } from 'vitest';
import type { OperatorIncidentOpenRow } from './ports';
import {
  listDueOutboundProviderIncidents,
  outboundProviderIncidentAlertPhase,
} from './outboundProviderIncidentCadence';

function incident(overrides: Partial<OperatorIncidentOpenRow> = {}): OperatorIncidentOpenRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    dedupKey: 'outbound_delivery_provider:email:provider_send_failed',
    direction: 'outbound_delivery_provider',
    integration: 'email',
    errorClass: 'provider_send_failed',
    errorDetail: null,
    openedAt: '2026-07-22T06:00:00.000Z',
    lastSeenAt: '2026-07-22T06:00:00.000Z',
    occurrenceCount: 1,
    alertSentAt: null,
    acknowledgedAt: null,
    initialAlertSentAt: null,
    oneHourAlertSentAt: null,
    ...overrides,
  };
}

describe('outbound provider incident cadence', () => {
  it('alerts immediately at T0', () => {
    expect(
      outboundProviderIncidentAlertPhase(incident(), Date.parse('2026-07-22T06:00:00.000Z')),
    ).toBe('initial');
  });

  it('does not repeat before T+1h and repeats at T+1h', () => {
    const row = incident({ alertSentAt: '2026-07-22T06:00:05.000Z' });
    expect(
      outboundProviderIncidentAlertPhase(row, Date.parse('2026-07-22T06:59:59.999Z')),
    ).toBeNull();
    expect(outboundProviderIncidentAlertPhase(row, Date.parse('2026-07-22T07:00:00.000Z'))).toBe(
      'one_hour_repeat',
    );
  });

  it('stops critical repeats after the one-hour escalation marker', () => {
    const row = incident({ alertSentAt: '2026-07-22T07:00:00.000Z' });
    expect(
      outboundProviderIncidentAlertPhase(row, Date.parse('2026-07-23T06:00:00.000Z')),
    ).toBeNull();
  });

  it('resolved/acknowledged incidents disappear from the open-row input', () => {
    expect(listDueOutboundProviderIncidents([], Date.parse('2026-07-22T07:00:00.000Z'))).toEqual(
      [],
    );
  });
});
