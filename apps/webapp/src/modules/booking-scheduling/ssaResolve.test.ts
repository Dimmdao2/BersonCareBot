import { describe, expect, it } from 'vitest';
import { pickPreferredSsaId } from './ssaResolve';

describe('ssaResolve', () => {
  it('prefers the newest active SSA', () => {
    const picked = pickPreferredSsaId([
      { id: 'ssa-old', createdAt: '2026-01-01T00:00:00.000Z', isActive: true },
      { id: 'ssa-new', createdAt: '2026-06-04T12:00:00.000Z', isActive: true },
    ]);
    expect(picked).toBe('ssa-new');
  });

  it('prefers active SSA over inactive when both exist for pair', () => {
    const picked = pickPreferredSsaId([
      { id: 'ssa-inactive', createdAt: '2026-06-05T00:00:00.000Z', isActive: false },
      { id: 'ssa-active', createdAt: '2026-01-01T00:00:00.000Z', isActive: true },
    ]);
    expect(picked).toBe('ssa-active');
  });

  it('returns newest when all rows are active', () => {
    const picked = pickPreferredSsaId([
      { id: 'ssa-a', createdAt: '2026-01-01T00:00:00.000Z', isActive: true },
      { id: 'ssa-b', createdAt: '2026-06-01T00:00:00.000Z', isActive: true },
    ]);
    expect(picked).toBe('ssa-b');
  });
});
