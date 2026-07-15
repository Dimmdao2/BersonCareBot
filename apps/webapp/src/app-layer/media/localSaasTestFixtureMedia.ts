import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SAAS_TEST_LOCAL_MEDIA_PATH = '/test-fixtures/saas-exercise.svg';
const REQUIRED_TEST_DATABASE = 'bersoncarebot_test';

export function databaseNameFromUrl(databaseUrl: string): string | null {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return null;
    const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim();
    return name || null;
  } catch {
    return null;
  }
}

export function isSaasTestLocalMediaAllowed(input: {
  databaseUrl: string;
  storedPath: string | null;
  s3Key: string | null;
  mimeType: string;
}): boolean {
  return (
    databaseNameFromUrl(input.databaseUrl) === REQUIRED_TEST_DATABASE &&
    input.storedPath === SAAS_TEST_LOCAL_MEDIA_PATH &&
    input.s3Key == null &&
    input.mimeType === 'image/svg+xml'
  );
}

export async function readSaasTestLocalMedia(input: {
  databaseUrl: string;
  storedPath: string | null;
  s3Key: string | null;
  mimeType: string;
  publicRoot?: string;
}): Promise<ArrayBuffer | null> {
  if (!isSaasTestLocalMediaAllowed(input)) return null;
  const publicRoot = input.publicRoot ?? join(process.cwd(), 'public');
  try {
    const body = await readFile(join(publicRoot, 'test-fixtures', 'saas-exercise.svg'));
    return Uint8Array.from(body).buffer;
  } catch {
    return null;
  }
}
