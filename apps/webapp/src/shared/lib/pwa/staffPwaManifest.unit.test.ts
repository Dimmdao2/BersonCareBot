import { describe, expect, it } from 'vitest';
import { staffPwaLayoutMetadata } from './staffPwaLayoutMetadata';
import { buildStaffPwaManifest } from './staffPwaManifest';

describe('staff PWA identity', () => {
  it('exposes Therapysto in the installed app and staff document metadata', () => {
    expect(buildStaffPwaManifest()).toMatchObject({
      name: 'Therapysto',
      short_name: 'Therapysto',
    });
    expect(staffPwaLayoutMetadata).toMatchObject({
      title: 'Therapysto',
      appleWebApp: { title: 'Therapysto' },
    });
  });
});
