import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('admin media repo mutation transactions', () => {
  it('routes media file metadata/delete writes through transaction-aware helpers', () => {
    const src = readFileSync(join(__dirname, 's3MediaStorage.ts'), 'utf8');

    expect(src).toContain('getCurrentDbPrincipalOrganizationId');
    expect(src).toContain('withPoolTransaction');
    expect(src).not.toContain('withPoolClient(pool, async (client) =>');
  });

  it('routes media folder mutations through runDrizzleMutationTransaction', () => {
    const src = readFileSync(join(__dirname, 'mediaFoldersRepo.ts'), 'utf8');

    expect(src).toContain('runDrizzleMutationTransaction');
    expect(src.match(/runDrizzleMutationTransaction/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
