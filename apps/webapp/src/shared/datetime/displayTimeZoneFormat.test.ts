import { describe, expect, it } from 'vitest';
import { formatDisplayZoneInstantRu } from './displayTimeZoneFormat';

describe('formatDisplayZoneInstantRu', () => {
  it('formats the same instant in the explicitly selected display timezone', () => {
    const instant = '2026-08-02T15:06:20.000Z';

    expect(formatDisplayZoneInstantRu(instant, 'UTC')).toMatch(/02\.08\.26, 15:06/);
    expect(formatDisplayZoneInstantRu(instant, 'Europe\/Moscow')).toMatch(/02\.08\.26, 18:06/);
  });
});
