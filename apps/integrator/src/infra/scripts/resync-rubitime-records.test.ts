import { describe, it, expect } from 'vitest';
import {
  normalizePhoneForCompare,
  isRubitimeCanceled,
  rubitimeRemoteDateToUtcIso,
  mapRemoteStatusToLocal,
  computeResyncDiff,
  isOutboxRepairCandidate,
  type LocalStatus,
} from './resync-rubitime-records.js';

// ── normalizePhoneForCompare ──────────────────────────────────────────────────

describe('normalizePhoneForCompare', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizePhoneForCompare(null)).toBeNull();
    expect(normalizePhoneForCompare(undefined)).toBeNull();
    expect(normalizePhoneForCompare('')).toBeNull();
    expect(normalizePhoneForCompare('   ')).toBeNull();
  });

  it('normalizes 11-digit starting with 8 → 7xxxxx', () => {
    expect(normalizePhoneForCompare('89001234567')).toBe('79001234567');
  });

  it('normalizes 10-digit starting with 9 → 7xxxxx', () => {
    expect(normalizePhoneForCompare('9001234567')).toBe('79001234567');
  });

  it('strips non-digit chars', () => {
    expect(normalizePhoneForCompare('+7 (900) 123-45-67')).toBe('79001234567');
  });

  it('returns raw digits for other lengths', () => {
    expect(normalizePhoneForCompare('79001234567')).toBe('79001234567');
  });

  it('returns null for all-non-digit input', () => {
    expect(normalizePhoneForCompare('abc')).toBeNull();
  });
});

// ── isRubitimeCanceled ────────────────────────────────────────────────────────

describe('isRubitimeCanceled', () => {
  it('returns true for status "4"', () => {
    expect(isRubitimeCanceled({ status: '4' })).toBe(true);
  });

  it('returns true for status "canceled"', () => {
    expect(isRubitimeCanceled({ status: 'canceled' })).toBe(true);
  });

  it('returns true for status "cancelled" (English double-l)', () => {
    expect(isRubitimeCanceled({ status: 'cancelled' })).toBe(true);
  });

  it('returns true for status_title containing "отмен"', () => {
    expect(isRubitimeCanceled({ status: '1', status_title: 'Отменена' })).toBe(true);
  });

  it('returns false for active status', () => {
    expect(isRubitimeCanceled({ status: '1', status_title: 'Подтверждена' })).toBe(false);
  });

  it('returns false for empty remote', () => {
    expect(isRubitimeCanceled({})).toBe(false);
  });
});

// ── rubitimeRemoteDateToUtcIso (normalizeToUtcInstant) ─────────────────────────

describe('rubitimeRemoteDateToUtcIso', () => {
  const MSK = 'Europe/Moscow';

  it('returns null for null/undefined/empty', () => {
    expect(rubitimeRemoteDateToUtcIso(null, MSK)).toBeNull();
    expect(rubitimeRemoteDateToUtcIso(undefined, MSK)).toBeNull();
    expect(rubitimeRemoteDateToUtcIso('', MSK)).toBeNull();
  });

  it('converts naive date-time in IANA zone', () => {
    const result = rubitimeRemoteDateToUtcIso('2026-04-01 10:00:00', MSK);
    expect(result).toBe('2026-04-01T07:00:00.000Z');
  });

  it('respects explicit Z suffix', () => {
    const result = rubitimeRemoteDateToUtcIso('2026-04-01T07:00:00.000Z', MSK);
    expect(result).toBe('2026-04-01T07:00:00.000Z');
  });

  it('respects explicit +03:00 offset', () => {
    const result = rubitimeRemoteDateToUtcIso('2026-04-01T10:00:00+03:00', MSK);
    expect(result).toBe('2026-04-01T07:00:00.000Z');
  });

  it('handles T-separated naive datetime', () => {
    const result = rubitimeRemoteDateToUtcIso('2026-04-01T10:00:00', MSK);
    expect(result).toBe('2026-04-01T07:00:00.000Z');
  });

  it('returns null for unparseable string', () => {
    expect(rubitimeRemoteDateToUtcIso('not-a-date', MSK)).toBeNull();
  });

  it('uses fixed-offset IANA for non-MSK zones', () => {
    const result = rubitimeRemoteDateToUtcIso('2026-04-01 10:00:00', 'Etc/GMT+5');
    expect(result).toBe('2026-04-01T15:00:00.000Z');
  });
});

// ── mapRemoteStatusToLocal ────────────────────────────────────────────────────

describe('mapRemoteStatusToLocal', () => {
  it('returns "canceled" when remote is canceled', () => {
    expect(mapRemoteStatusToLocal({ status: '4' }, 'created')).toBe('canceled');
    expect(mapRemoteStatusToLocal({ status: 'canceled' }, 'updated')).toBe('canceled');
  });

  it('returns "updated" when local is "canceled" but remote is active', () => {
    expect(mapRemoteStatusToLocal({ status: '1' }, 'canceled')).toBe('updated');
  });

  it('preserves local status when remote is active and local is active', () => {
    expect(mapRemoteStatusToLocal({ status: '1' }, 'created')).toBe('created');
    expect(mapRemoteStatusToLocal({ status: '1' }, 'updated')).toBe('updated');
  });
});

// ── computeResyncDiff ─────────────────────────────────────────────────────────

function makeLocalRow(overrides: Partial<{
  id: number;
  rubitime_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: LocalStatus;
  payload_json: unknown;
  updated_at: Date | null;
  created_at: Date | null;
}> = {}): {
  id: number;
  rubitime_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: LocalStatus;
  payload_json: unknown;
  updated_at: Date | null;
  created_at: Date | null;
} {
  return {
    id: 1,
    rubitime_record_id: '100',
    phone_normalized: '79001234567',
    record_at: new Date('2026-04-01T07:00:00.000Z'),
    status: 'created',
    payload_json: { branch_id: '5', service_id: '10', name: 'Иван', record: '2026-04-01 10:00:00' },
    updated_at: new Date('2026-04-01T07:00:00.000Z'),
    created_at: new Date('2026-04-01T07:00:00.000Z'),
    ...overrides,
  };
}

const MSK = 'Europe/Moscow';

describe('computeResyncDiff', () => {
  it('returns empty diff for matching records', () => {
    const local = makeLocalRow();
    const remote: Record<string, unknown> = {
      id: '100',
      phone: '79001234567',
      status: '1',
      branch_id: '5',
      service_id: '10',
      name: 'Иван',
      record: '2026-04-01 10:00:00',
      updated_at: '2026-04-01 10:00:00',
    };
    const diff = computeResyncDiff(local, remote, MSK, 120);
    expect(diff.classes).toHaveLength(0);
    expect(diff.reasons).toHaveLength(0);
  });

  it('detects record_at mismatch (diffMin=-120)', () => {
    const local = makeLocalRow({
      record_at: new Date('2026-04-01T07:00:00.000Z'), // 10:00 MSK
    });
    const remote: Record<string, unknown> = {
      phone: '79001234567',
      status: '1',
      record: '2026-04-01 08:00:00', // 08:00 MSK → UTC 05:00
    };
    const diff = computeResyncDiff(local, remote, MSK, 120);
    expect(diff.classes).toContain('record_at');
    const reason = diff.reasons.find((r) => r.startsWith('record_at'));
    expect(reason).toMatch(/diffMin=-120/);
  });

  it('detects status mismatch (active → canceled)', () => {
    const local = makeLocalRow({ status: 'created' });
    const remote: Record<string, unknown> = {
      status: '4',
      phone: '79001234567',
    };
    const diff = computeResyncDiff(local, remote, MSK, 120);
    expect(diff.classes).toContain('status');
  });

  it('detects phone mismatch', () => {
    const local = makeLocalRow({ phone_normalized: '79001234567' });
    const remote: Record<string, unknown> = {
      status: '1',
      phone: '79009999999',
    };
    const diff = computeResyncDiff(local, remote, MSK, 120);
    expect(diff.classes).toContain('phone');
  });

  it('detects payload drift (changed service_id)', () => {
    const local = makeLocalRow({
      payload_json: { branch_id: '5', service_id: '10' },
    });
    const remote: Record<string, unknown> = {
      status: '1',
      phone: '79001234567',
      branch_id: '5',
      service_id: '99', // changed
    };
    const diff = computeResyncDiff(local, remote, MSK, 120);
    expect(diff.classes).toContain('payload');
  });

  it('detects stale updated_at (exceeds threshold)', () => {
    const local = makeLocalRow({
      updated_at: new Date('2026-03-30T07:00:00.000Z'), // 3 days ago MSK
    });
    const remote: Record<string, unknown> = {
      status: '1',
      phone: '79001234567',
      // remote updated_at = now + 3 days → diff >> 120 min
      updated_at: '2026-04-01 10:00:00',
    };
    const diff = computeResyncDiff(local, remote, MSK, 120);
    expect(diff.classes).toContain('stale');
    const reason = diff.reasons.find((r) => r.startsWith('stale'));
    expect(reason).toMatch(/diffMin=\d+/);
  });

  it('does NOT flag stale when diff is below threshold', () => {
    const local = makeLocalRow({
      updated_at: new Date('2026-04-01T05:30:00.000Z'), // 30 min before remote
    });
    const remote: Record<string, unknown> = {
      status: '1',
      phone: '79001234567',
      updated_at: '2026-04-01 08:30:00', // +30 min from local in MSK
    };
    const diff = computeResyncDiff(local, remote, MSK, 120);
    expect(diff.classes).not.toContain('stale');
  });

  it('deduplicates classes when multiple reasons for same class', () => {
    const local = makeLocalRow({ status: 'canceled' });
    const remote: Record<string, unknown> = { status: '1' };
    const diff = computeResyncDiff(local, remote, MSK, 120);
    const statusCount = diff.classes.filter((c) => c === 'status').length;
    expect(statusCount).toBe(1);
  });
});

// ── isOutboxRepairCandidate ───────────────────────────────────────────────────

describe('isOutboxRepairCandidate', () => {
  it('returns true for dead event with platform_user_id in last_error', () => {
    expect(
      isOutboxRepairCandidate({
        event_type: 'appointment.record.upserted',
        status: 'dead',
        last_error: 'null value in column "platform_user_id" of relation patient_bookings',
      }),
    ).toBe(true);
  });

  it('returns true for pending event with platform_user_id in last_error', () => {
    expect(
      isOutboxRepairCandidate({
        event_type: 'appointment.record.upserted',
        status: 'pending',
        last_error: 'violates not-null constraint on platform_user_id',
      }),
    ).toBe(true);
  });

  it('returns false for different event_type', () => {
    expect(
      isOutboxRepairCandidate({
        event_type: 'user.upserted',
        status: 'dead',
        last_error: 'platform_user_id null',
      }),
    ).toBe(false);
  });

  it('returns false for done status', () => {
    expect(
      isOutboxRepairCandidate({
        event_type: 'appointment.record.upserted',
        status: 'done',
        last_error: 'platform_user_id null',
      }),
    ).toBe(false);
  });

  it('returns false when last_error is null', () => {
    expect(
      isOutboxRepairCandidate({
        event_type: 'appointment.record.upserted',
        status: 'dead',
        last_error: null,
      }),
    ).toBe(false);
  });

  it('returns false when last_error does not mention platform_user_id', () => {
    expect(
      isOutboxRepairCandidate({
        event_type: 'appointment.record.upserted',
        status: 'dead',
        last_error: 'some other error',
      }),
    ).toBe(false);
  });

  it('is case-insensitive for platform_user_id match', () => {
    expect(
      isOutboxRepairCandidate({
        event_type: 'appointment.record.upserted',
        status: 'dead',
        last_error: 'PLATFORM_USER_ID is null',
      }),
    ).toBe(true);
  });
});
