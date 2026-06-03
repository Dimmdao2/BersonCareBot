import { describe, expect, it } from 'vitest';
import {
  computePackageSessionIndex,
  formatPackageSessionDescriptionLine,
} from './packageSessionIndex.js';

describe('computePackageSessionIndex', () => {
  it('formats session line from usage order', () => {
    const index = computePackageSessionIndex({
      items: [{ quantity_initial: 4 }],
      usages: [
        { id: 'u1', usage_kind: 'reserve', occurred_at: '2026-01-01T00:00:00Z' },
        { id: 'u2', usage_kind: 'consume', occurred_at: '2026-01-02T00:00:00Z' },
      ],
      usageRefId: 'u2',
      soldAt: '2026-05-01T12:00:00Z',
      createdAt: '2026-04-01T00:00:00Z',
    });
    expect(index).toEqual({
      sessionIndex: 2,
      totalSessions: 4,
      soldAtLabel: '2026-05-01',
    });
    expect(formatPackageSessionDescriptionLine(index!)).toBe(
      'Абонемент от 2026-05-01: сеанс 2 из 4',
    );
  });
});
