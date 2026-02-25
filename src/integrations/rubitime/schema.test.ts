import { describe, expect, it } from 'vitest';
import { parseRubitimeBody } from './schema.js';

describe('parseRubitimeBody', () => {
  it('parses valid payload with required fields', () => {
    const result = parseRubitimeBody({
      from: 'rubitime',
      event: 'event-create-record',
      data: {
        id: 'rec-1',
        record: '2025-02-24 14:00',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBe('rubitime');
      expect(result.data.event).toBe('event-create-record');
      expect(result.data.data.id).toBe('rec-1');
      expect(result.data.data.record).toBe('2025-02-24 14:00');
    }
  });

  it('keeps arbitrary keys in data object', () => {
    const result = parseRubitimeBody({
      from: 'rubitime',
      event: 'event-update-record',
      data: {
        id: 'rec-2',
        nested: { foo: 'bar' },
        extra_flag: true,
        price: 1200,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.nested).toEqual({ foo: 'bar' });
      expect(result.data.data.extra_flag).toBe(true);
      expect(result.data.data.price).toBe(1200);
    }
  });

  it('fails when event is unsupported', () => {
    const result = parseRubitimeBody({
      from: 'rubitime',
      event: 'event-unknown',
      data: {},
    });

    expect(result.success).toBe(false);
  });

  it('fails when data is not an object', () => {
    const result = parseRubitimeBody({
      from: 'rubitime',
      event: 'event-remove-record',
      data: 'not-object',
    });

    expect(result.success).toBe(false);
  });
});
