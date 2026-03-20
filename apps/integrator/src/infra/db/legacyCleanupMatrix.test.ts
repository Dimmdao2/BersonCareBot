import { describe, expect, it } from 'vitest';
import {
  LEGACY_CLEANUP_MATRIX,
  getMigratedDomains,
  getMatrixByDomain,
  getEntriesWithAction,
} from './legacyCleanupMatrix.js';

describe('legacyCleanupMatrix', () => {
  it('includes all migrated domains', () => {
    const domains = getMigratedDomains();
    expect(domains).toContain('person');
    expect(domains).toContain('communication');
    expect(domains).toContain('reminders');
    expect(domains).toContain('appointments');
    expect(domains).toContain('subscription_mailing');
    expect(domains.length).toBe(5);
  });

  it('has no remove_after_tests for raw or runtime category', () => {
    const dangerous = LEGACY_CLEANUP_MATRIX.filter(
      (e) =>
        (e.category === 'raw' || e.category === 'runtime') &&
        e.stage13Action === 'remove_after_tests'
    );
    expect(dangerous).toHaveLength(0);
  });

  it('marks mailing_topics and user_subscriptions as freeze (cleanup candidates)', () => {
    const subscription = LEGACY_CLEANUP_MATRIX.filter(
      (e) =>
        e.domain === 'subscription_mailing' &&
        (e.fileOrSymbol.includes('mailing_topics') || e.fileOrSymbol.includes('user_subscriptions'))
    );
    expect(subscription.length).toBeGreaterThanOrEqual(2);
    expect(subscription.every((e) => e.stage13Action === 'freeze')).toBe(true);
  });

  it('getMatrixByDomain returns entries for domain', () => {
    const person = getMatrixByDomain('person');
    expect(person.length).toBeGreaterThan(0);
    expect(person.every((e) => e.domain === 'person')).toBe(true);
  });

  it('getEntriesWithAction returns entries by action', () => {
    const keep = getEntriesWithAction('keep');
    const freeze = getEntriesWithAction('freeze');
    expect(keep.length).toBeGreaterThan(0);
    expect(freeze.length).toBeGreaterThan(0);
  });
});
