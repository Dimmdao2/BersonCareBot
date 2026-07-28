import { describe, expect, it } from 'vitest';
import {
  browserRequiresPwaStandaloneForAppPath,
  isPwaMessengerEntryPath,
  shouldAllowPwaAppShellAccess,
} from '@/shared/lib/pwa/pwaAppAccessPolicy';

describe('pwaAppAccessPolicy', () => {
  it('keeps the patient cabinet available in an ordinary browser', () => {
    expect(browserRequiresPwaStandaloneForAppPath('/app/patient')).toBe(false);
    expect(browserRequiresPwaStandaloneForAppPath('/app/patient/diary')).toBe(false);
    expect(
      shouldAllowPwaAppShellAccess({
        pathname: '/app/patient',
        search: '',
        standalone: false,
        messengerMiniApp: false,
        allowBrowserAccess: false,
      }),
    ).toBe(true);
  });

  it('does not turn install state into access authority for any app surface', () => {
    for (const pathname of ['/app/patient/program', '/app/doctor', '/app/settings', '/app']) {
      expect(
        shouldAllowPwaAppShellAccess({
          pathname,
          search: '?from=test',
          standalone: false,
          messengerMiniApp: false,
        }),
      ).toBe(true);
    }
  });

  it('still identifies explicit messenger entry routes independently from browser access', () => {
    expect(isPwaMessengerEntryPath('/app/tg')).toBe(true);
    expect(isPwaMessengerEntryPath('/app/max/')).toBe(true);
    expect(isPwaMessengerEntryPath('/app/patient')).toBe(false);
  });
});
