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

  // #1069 Т5-Т8 (owner 03.08): the trial-extension grace stage is gone — a trial that has ended
  // reads as its post-trial rule (here `blocked`) immediately, with no mention of a grace window.
  it('reads a lapsed trial as its post-trial rule, with no grace wording', () => {
    const message = describeCommercialAccessState({
      lifecycle: 'blocked',
      tariffId: 'tariff',
      source: 'trial',
      trialEndsAt: '2026-08-15T00:00:00.000Z',
    });

    expect(message).toContain('заблокирован');
    expect(message).not.toContain('льгот');
  });
});
