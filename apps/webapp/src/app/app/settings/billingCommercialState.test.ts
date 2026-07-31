import { describe, expect, it } from 'vitest';
import { describeCommercialAccessState } from './billingCommercialState';

describe('§5a stage 6.1 — read-only names what exactly it forbids', () => {
  it('states that creating and changing are blocked, not just an opaque "read only"', () => {
    const message = describeCommercialAccessState({
      lifecycle: 'read_only',
      tariffId: 'tariff',
      source: 'assignment',
    });

    expect(message).toContain('создавать и менять нельзя');
  });

  it('names the grace deadline date, not just that grace is active', () => {
    const message = describeCommercialAccessState({
      lifecycle: 'grace',
      tariffId: 'tariff',
      source: 'trial',
      trialGraceEndsAt: '2026-08-15T00:00:00.000Z',
    });

    expect(message).toContain('15.08.2026');
  });
});
