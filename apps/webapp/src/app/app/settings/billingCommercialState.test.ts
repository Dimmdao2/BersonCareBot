import { describe, expect, it } from 'vitest';
import { describeCommercialAccessState } from './billingCommercialState';

/**
 * Проверяется разбор состояния, а не формулировки: эталоны берутся у самой функции, поэтому
 * редактура текста ничего здесь не ломает, а подмена ветки — ломает. Дословных фраз в проверках
 * нет; отрицательные проверки оставлены там, где владелец запретил само понятие (льготное окно).
 */
const ACTIVE_TARIFF = describeCommercialAccessState({
  lifecycle: 'active',
  tariffId: 'tariff',
  source: 'assignment',
});
const READ_ONLY = describeCommercialAccessState({
  lifecycle: 'read_only',
  tariffId: 'tariff',
  source: 'assignment',
});
const BLOCKED = describeCommercialAccessState({
  lifecycle: 'blocked',
  tariffId: 'tariff',
  source: 'assignment',
});

describe('§5a stage 6.1 — read-only names what exactly it forbids', () => {
  it('separates read-only from blocked and from an active tariff', () => {
    expect(READ_ONLY).not.toBe(ACTIVE_TARIFF);
    expect(READ_ONLY).not.toBe(BLOCKED);
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

    expect(message).toBe(BLOCKED);
    expect(message).not.toMatch(/льгот|отсрочк|продлён|продлен/iu);
  });

  it('reads a lapsed paid period as read-only, not as an active tariff', () => {
    const message = describeCommercialAccessState({
      lifecycle: 'read_only',
      tariffId: 'tariff',
      source: 'assignment',
      degradationStartedAt: '2026-07-01T00:00:00.000Z',
    });

    expect(message).toBe(READ_ONLY);
    expect(message).not.toBe(ACTIVE_TARIFF);
  });

  it('reads a post-paid tariff switch as an active tariff', () => {
    const message = describeCommercialAccessState({
      lifecycle: 'active',
      tariffId: 'fallback-tariff',
      source: 'post_paid_period_tariff',
    });

    expect(message).toBe(ACTIVE_TARIFF);
  });
});
