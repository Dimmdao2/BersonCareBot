/** @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  databaseNameFromUrl,
  isSaasTestLocalMediaAllowed,
  readSaasTestLocalMedia,
  SAAS_TEST_LOCAL_MEDIA_PATH,
} from './localSaasTestFixtureMedia';

const testDbUrl = 'postgresql://fixture:secret@127.0.0.1:5432/bersoncarebot_test';

describe('local SaaS TEST fixture media', () => {
  it('allows only the exact TEST database, fixed path, null S3 key and fixed MIME', () => {
    expect(databaseNameFromUrl(testDbUrl)).toBe('bersoncarebot_test');
    expect(
      isSaasTestLocalMediaAllowed({
        databaseUrl: testDbUrl,
        storedPath: SAAS_TEST_LOCAL_MEDIA_PATH,
        s3Key: null,
        mimeType: 'image/svg+xml',
      }),
    ).toBe(true);
    for (const input of [
      { databaseUrl: testDbUrl.replace('bersoncarebot_test', 'bcb_webapp_prod') },
      { databaseUrl: testDbUrl, storedPath: '/etc/passwd' },
      { databaseUrl: testDbUrl, s3Key: 'media/external' },
      { databaseUrl: testDbUrl, mimeType: 'video/mp4' },
    ]) {
      expect(
        isSaasTestLocalMediaAllowed({
          databaseUrl: input.databaseUrl,
          storedPath: input.storedPath ?? SAAS_TEST_LOCAL_MEDIA_PATH,
          s3Key: input.s3Key ?? null,
          mimeType: input.mimeType ?? 'image/svg+xml',
        }),
      ).toBe(false);
    }
  });

  it('reads the committed standalone-copied artifact as real image bytes', async () => {
    const body = await readSaasTestLocalMedia({
      databaseUrl: testDbUrl,
      storedPath: SAAS_TEST_LOCAL_MEDIA_PATH,
      s3Key: null,
      mimeType: 'image/svg+xml',
      publicRoot: join(process.cwd(), 'public'),
    });
    expect(body).not.toBeNull();
    if (body == null) throw new Error('expected_local_fixture_bytes');
    const text = new TextDecoder().decode(body);
    expect(text).toContain('<svg');
    expect(text).toContain('SaaS TEST');
    expect(text).not.toContain('<script');
  });
});
