import { describe, expect, it } from 'vitest';

import { buildPatientReminderDeepLink } from './buildPatientReminderDeepLink.js';

describe('buildPatientReminderDeepLink', () => {
  it('builds treatment_program_item URL with nav=exec', () => {
    const url = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example',
      linkedObjectType: 'treatment_program_item',
      linkedObjectId: 'inst-1:item-2',
    });
    expect(url).toBe(
      'https://app.example/app/patient/treatment/inst-1/item/item-2?nav=exec&from=reminder',
    );
  });

  it('falls back to reminders when treatment_program_item id is malformed', () => {
    const url = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example',
      linkedObjectType: 'treatment_program_item',
      linkedObjectId: 'nocolon',
    });
    expect(url).toBe('https://app.example/app/patient/reminders?from=reminder');
  });

  it('maps rehab_program to treatment route', () => {
    const url = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example',
      linkedObjectType: 'rehab_program',
      linkedObjectId: 'prog-9',
    });
    expect(url).toBe('https://app.example/app/patient/treatment/prog-9?from=reminder');
  });

  it('warmup intent uses go daily-warmup URL (overrides linked object)', () => {
    const url = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example',
      linkedObjectType: 'treatment_program_item',
      linkedObjectId: 'inst-1:item-2',
      reminderIntent: 'warmup',
    });
    expect(url).toBe('https://app.example/app/patient/go/daily-warmup?from=reminder');
  });

  it('carries the occurrence organization into intent go URLs', () => {
    const url = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example',
      linkedObjectType: 'rehab_program',
      linkedObjectId: 'prog-9',
      reminderIntent: 'exercises',
      organizationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(url).toBe(
      'https://app.example/app/patient/go/plan-start-lesson?from=reminder&organizationId=11111111-1111-4111-8111-111111111111',
    );
  });

  it('exercises intent uses go plan-start-lesson URL', () => {
    const url = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example',
      linkedObjectType: 'rehab_program',
      linkedObjectId: 'prog-9',
      reminderIntent: 'exercises',
    });
    expect(url).toBe('https://app.example/app/patient/go/plan-start-lesson?from=reminder');
  });

  it('stretch intent uses go plan-start-lesson URL', () => {
    const url = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example',
      linkedObjectType: 'content_section',
      linkedObjectId: 'warmups',
      reminderIntent: 'stretch',
    });
    expect(url).toBe('https://app.example/app/patient/go/plan-start-lesson?from=reminder');
  });

  it('generic intent + warmups section slug uses go daily-warmup URL (legacy rules)', () => {
    const url = buildPatientReminderDeepLink({
      appBaseUrl: 'https://app.example',
      linkedObjectType: 'content_section',
      linkedObjectId: 'warmups',
      reminderIntent: 'generic',
    });
    expect(url).toBe('https://app.example/app/patient/go/daily-warmup?from=reminder');
  });

  it('generic intent + renamed warmups slug via warmupsSectionSlugs uses go URL', () => {
    const url = buildPatientReminderDeepLink(
      {
        appBaseUrl: 'https://app.example',
        linkedObjectType: 'content_section',
        linkedObjectId: 'razminki',
        reminderIntent: 'generic',
      },
      { warmupsSectionSlugs: new Set(['razminki']) },
    );
    expect(url).toBe('https://app.example/app/patient/go/daily-warmup?from=reminder');
  });
});
