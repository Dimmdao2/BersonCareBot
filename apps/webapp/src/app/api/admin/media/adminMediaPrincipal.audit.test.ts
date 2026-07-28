import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('admin media residual principal coverage', () => {
  it('admin media file mutations use selected workspace principal', () => {
    const src = read('src/app/api/admin/media/[id]/route.ts');
    expect(src).toContain('requireDoctorWorkspaceApiContext');
    expect(src).toContain('withDoctorWorkspacePrincipal');
    expect(src).toContain('deps.media.deleteHard');
    expect(src).toContain('deps.media.updateMediaFolder');
    expect(src).toContain('deps.media.updateDisplayName');
  });

  it('admin media folder mutations use selected workspace principal', () => {
    const createRoute = read('src/app/api/admin/media/folders/route.ts');
    const itemRoute = read('src/app/api/admin/media/folders/[id]/route.ts');
    for (const src of [createRoute, itemRoute]) {
      expect(src).toContain('requireDoctorWorkspaceApiContext');
      expect(src).toContain('withDoctorWorkspacePrincipal');
    }
    expect(createRoute).toContain('deps.media.createFolder');
    expect(itemRoute).toContain('deps.media.moveFolder');
    expect(itemRoute).toContain('deps.media.renameFolder');
    expect(itemRoute).toContain('deps.media.deleteFolder');
  });

  it('media file and folder repos require principal-aware writes', () => {
    const storage = read('src/infra/repos/s3MediaStorage.ts');
    expect(storage).toContain('getCurrentDbPrincipalOrganizationId');
    expect(storage).toContain('organization_principal_required');
    expect(storage).toContain('withPoolTransaction');
    expect(storage).toContain('organization_id');

    const folders = read('src/infra/repos/mediaFoldersRepo.ts');
    expect(folders).toContain('getCurrentDbPrincipalOrganizationId');
    expect(folders).toContain('runDrizzleMutationTransaction');
    expect(folders).toContain('organization_principal_required');
    expect(folders).toContain('organization_principal_mismatch');
    expect(folders).toContain('organizationId');
  });
});
