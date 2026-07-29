import { describe, expect, it } from 'vitest';

import { buildReminderDeepLink } from './buildReminderDeepLink';

describe('buildReminderDeepLink', () => {
  it('warmup intent uses go daily-warmup URL', () => {
    expect(
      buildReminderDeepLink({
        linkedObjectType: 'content_section',
        linkedObjectId: 'warmups',
        reminderIntent: 'warmup',
        appBaseUrl: 'https://app.example',
      }),
    ).toBe('https://app.example/app/patient/go/daily-warmup?from=reminder');
  });

  it('carries the exact reminder organization into a go URL', () => {
    expect(
      buildReminderDeepLink({
        linkedObjectType: 'rehab_program',
        linkedObjectId: 'program-a',
        reminderIntent: 'exercises',
        organizationId: '11111111-1111-4111-8111-111111111111',
        appBaseUrl: 'https://app.example',
      }),
    ).toBe(
      'https://app.example/app/patient/go/plan-start-lesson?from=reminder&organizationId=11111111-1111-4111-8111-111111111111',
    );
  });

  it('generic intent + warmups section slug uses go daily-warmup URL (legacy rules)', () => {
    expect(
      buildReminderDeepLink({
        linkedObjectType: 'content_section',
        linkedObjectId: 'warmups',
        reminderIntent: 'generic',
        appBaseUrl: 'https://app.example',
      }),
    ).toBe('https://app.example/app/patient/go/daily-warmup?from=reminder');
  });

  it('generic intent + renamed warmups slug via warmupsSectionSlugs uses go URL', () => {
    expect(
      buildReminderDeepLink(
        {
          linkedObjectType: 'content_section',
          linkedObjectId: 'razminki',
          reminderIntent: 'generic',
          appBaseUrl: 'https://app.example',
        },
        { warmupsSectionSlugs: new Set(['razminki']) },
      ),
    ).toBe('https://app.example/app/patient/go/daily-warmup?from=reminder');
  });

  it('generic intent + non-warmups section uses section list URL', () => {
    expect(
      buildReminderDeepLink({
        linkedObjectType: 'content_section',
        linkedObjectId: 'lessons',
        reminderIntent: 'generic',
        appBaseUrl: 'https://app.example',
      }),
    ).toBe('https://app.example/app/patient/sections/lessons?from=reminder');
  });
});
