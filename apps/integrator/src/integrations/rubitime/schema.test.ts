import { describe, expect, it } from 'vitest';
import { parseRubitimeBody, parseRubitimeCreateRecordInput, parseRubitimeSlotsQuery } from './schema.js';

describe('parseRubitimeBody', () => {
  it('accepts valid webhook body', () => {
    const res = parseRubitimeBody({
      from: 'rubitime',
      event: 'event-update-record',
      data: { id: 'rec-1', phone: '+79990001122' },
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.event).toBe('event-update-record');
      expect(res.data.data).toMatchObject({ id: 'rec-1' });
    }
  });

  it('rejects unknown event', () => {
    const res = parseRubitimeBody({
      from: 'rubitime',
      event: 'event-unknown',
      data: {},
    });

    expect(res.success).toBe(false);
  });
});

describe('parseRubitimeSlotsQuery v1/v2', () => {
  it('accepts v1 online query', () => {
    const res = parseRubitimeSlotsQuery({
      type: 'online',
      category: 'general',
      date: '2026-04-10',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect('version' in res.data).toBe(false);
      expect(res.data).toMatchObject({ type: 'online', category: 'general' });
    }
  });

  it('accepts v2 with explicit IDs and duration', () => {
    const res = parseRubitimeSlotsQuery({
      version: 'v2',
      rubitimeBranchId: '1',
      rubitimeCooperatorId: '2',
      rubitimeServiceId: '3',
      slotDurationMinutes: 45,
      dateFrom: '2026-04-10',
    });
    expect(res.success).toBe(true);
    if (res.success && 'version' in res.data && res.data.version === 'v2') {
      expect(res.data.slotDurationMinutes).toBe(45);
    }
  });

  it('rejects v2 without slotDurationMinutes', () => {
    const res = parseRubitimeSlotsQuery({
      version: 'v2',
      rubitimeBranchId: '1',
      rubitimeCooperatorId: '2',
      rubitimeServiceId: '3',
    });
    expect(res.success).toBe(false);
  });
});

describe('parseRubitimeCreateRecordInput v1/v2', () => {
  it('accepts v1 with slotEnd', () => {
    const res = parseRubitimeCreateRecordInput({
      type: 'online',
      category: 'general',
      slotStart: '2026-04-10T10:00:00.000Z',
      slotEnd: '2026-04-10T11:00:00.000Z',
      contactName: 'A',
      contactPhone: '+7999',
    });
    expect(res.success).toBe(true);
  });

  it('accepts v2 with patient block (no slotEnd)', () => {
    const res = parseRubitimeCreateRecordInput({
      version: 'v2',
      rubitimeBranchId: '10',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotStart: '2026-04-10T10:00:00.000Z',
      patient: { name: 'B', phone: '+7888' },
    });
    expect(res.success).toBe(true);
    if (res.success && 'version' in res.data && res.data.version === 'v2') {
      expect(res.data.patient.name).toBe('B');
    }
  });

  it('rejects v2 without patient', () => {
    const res = parseRubitimeCreateRecordInput({
      version: 'v2',
      rubitimeBranchId: '10',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotStart: '2026-04-10T10:00:00.000Z',
    });
    expect(res.success).toBe(false);
  });

  it('rejects v2 when localBookingId is not a UUID', () => {
    const res = parseRubitimeCreateRecordInput({
      version: 'v2',
      rubitimeBranchId: '10',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotStart: '2026-04-10T10:00:00.000Z',
      patient: { name: 'B', phone: '+7888' },
      localBookingId: 'not-a-uuid',
    });
    expect(res.success).toBe(false);
  });

  it('accepts v2 with optional localBookingId UUID', () => {
    const res = parseRubitimeCreateRecordInput({
      version: 'v2',
      rubitimeBranchId: '10',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotStart: '2026-04-10T10:00:00.000Z',
      patient: { name: 'B', phone: '+7888' },
      localBookingId: '6f14566f-a4de-4ab4-9336-5ddf806cd6ce',
    });
    expect(res.success).toBe(true);
  });
});
