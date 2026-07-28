import { describe, expect, it } from 'vitest';
import { describeCommercialAccessState } from './billingCommercialState';

describe('describeCommercialAccessState', () => {
  it('names compatibility mode without a raw enum', () => {
    expect(
      describeCommercialAccessState({
        lifecycle: 'active',
        tariffId: null,
        source: 'compatibility',
      }),
    ).toBe(
      'Совместимость: коммерческий тариф ещё не подключён администратором платформы, доступ работает в режиме до введения тарифов.',
    );
  });

  it('names no_trial', () => {
    expect(
      describeCommercialAccessState({ lifecycle: 'active', tariffId: null, source: 'no_trial' }),
    ).toBe(
      'Пробный период не активирован и тариф не назначен — доступ к платным механикам ограничен.',
    );
  });

  it('shows the trial end date while active', () => {
    expect(
      describeCommercialAccessState({
        lifecycle: 'active',
        tariffId: 't1',
        source: 'trial',
        trialEndsAt: '2026-08-15T00:00:00.000Z',
      }),
    ).toBe('Пробный период активен до 15.08.2026.');
  });

  it('falls back to a dateless trial-active sentence when no end date is present', () => {
    expect(
      describeCommercialAccessState({ lifecycle: 'active', tariffId: 't1', source: 'trial' }),
    ).toBe('Пробный период активен.');
  });

  it('shows the grace end date', () => {
    expect(
      describeCommercialAccessState({
        lifecycle: 'grace',
        tariffId: 't1',
        source: 'trial',
        trialEndsAt: '2026-07-01T00:00:00.000Z',
        trialGraceEndsAt: '2026-07-10T00:00:00.000Z',
      }),
    ).toBe('Пробный период завершён — включён льготный период до 10.07.2026.');
  });

  it('reports blocked access', () => {
    expect(
      describeCommercialAccessState({ lifecycle: 'blocked', tariffId: 't1', source: 'trial' }),
    ).toBe('Доступ заблокирован — обратитесь к администратору платформы.');
  });

  it('reports read_only access', () => {
    expect(
      describeCommercialAccessState({ lifecycle: 'read_only', tariffId: 't1', source: 'trial' }),
    ).toBe('Доступ только для чтения — обратитесь к администратору платформы.');
  });

  it('reports an active assigned tariff plainly', () => {
    expect(
      describeCommercialAccessState({ lifecycle: 'active', tariffId: 't1', source: 'assignment' }),
    ).toBe('Тариф активен.');
  });

  it('reports an active post-trial tariff plainly', () => {
    expect(
      describeCommercialAccessState({
        lifecycle: 'active',
        tariffId: 't1',
        source: 'post_trial_tariff',
      }),
    ).toBe('Тариф активен.');
  });
});
