import { describe, expect, it } from 'vitest';
import { parseRubitimeBody } from './schema.js';

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
