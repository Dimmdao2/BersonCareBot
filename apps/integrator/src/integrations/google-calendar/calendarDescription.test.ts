import { describe, expect, it } from 'vitest';
import {
  buildGoogleCalendarDescription,
  formatPhoneHashtag,
} from './calendarDescription.js';

describe('google calendar description format', () => {
  it('formats phone as hashtag with plus', () => {
    expect(formatPhoneHashtag('+79991234567')).toBe('#+79991234567');
    expect(formatPhoneHashtag('79991234567')).toBe('#+79991234567');
  });

  it('builds description blocks in order without rubitime id', () => {
    expect(
      buildGoogleCalendarDescription({
        phoneNormalized: '+79189000792',
        clientComment: 'Болит спина',
        staffComment: 'Часто опаздывает',
        isProblematic: true,
        supportProgramTitle: 'План реабилитации',
      }),
    ).toBe(
      '#+79189000792\n\n'
        + 'Болит спина\n\n'
        + 'Часто опаздывает\n'
        + 'Проблемный\n\n'
        + 'На сопровождении: План реабилитации',
    );
  });

  it('shows only problematic marker when note is empty', () => {
    expect(
      buildGoogleCalendarDescription({
        phoneNormalized: '+79001112233',
        isProblematic: true,
      }),
    ).toBe('#+79001112233\n\nПроблемный');
  });
});
