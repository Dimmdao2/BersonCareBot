import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeRoot = __dirname;
const srcRoot = join(__dirname, '../../../../..');

function routeSource(relativePath: string): string {
  return readFileSync(join(routeRoot, relativePath), 'utf8');
}

function webappSource(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), 'utf8');
}

describe('doctor patient residual write routes use workspace principal', () => {
  it('profile, fio, and physical write routes use workspace API context and source-specific principals', () => {
    const cases = [
      ['route.ts', 'doctor.patients.profile.update'],
      ['fio/route.ts', 'doctor.patients.fio.update'],
      ['physical/route.ts', 'doctor.patients.physical.update'],
    ] as const;

    for (const [file, source] of cases) {
      const src = routeSource(file);
      expect(src).toContain('requireDoctorWorkspaceApiContext');
      expect(src).toContain('withDoctorWorkspacePrincipal');
      expect(src).toContain(source);
    }
  });

  it('comorbidities, files, and payment write routes declare the assigned principal sources', () => {
    const expectedByFile = new Map([
      ['comorbidities/route.ts', ['doctor.patients.comorbidities.create']],
      [
        'comorbidities/[comorbidityId]/route.ts',
        [
          'doctor.patients.comorbidities.update',
          'doctor.patients.comorbidities.delete',
          'doctor.patients.comorbidities.restore',
        ],
      ],
      ['files/route.ts', ['doctor.patients.files.create']],
      ['files/[fileId]/route.ts', ['doctor.patients.files.link', 'doctor.patients.files.rename']],
      ['payments/route.ts', ['doctor.patients.payments.cash.create']],
      ['acquiring-charge/route.ts', ['doctor.patients.payments.acquiring.record']],
    ]);

    for (const [file, sources] of expectedByFile) {
      const src = routeSource(file);
      expect(src).toContain('requireDoctorWorkspaceApiContext');
      expect(src).toContain('withDoctorWorkspacePrincipal');
      for (const source of sources) {
        expect(src).toContain(source);
      }
    }
  });

  it('touched repo write methods are transaction-backed', () => {
    const transactionBackedRepoFiles = [
      'infra/repos/pgDoctorClients.ts',
      'infra/repos/pgPatientFiles.ts',
      'infra/repos/pgPatientComorbidities.ts',
    ];

    for (const file of transactionBackedRepoFiles) {
      const src = webappSource(file);
      expect(
        src.includes('runDrizzleMutationTransaction') || src.includes('runWebappTransaction'),
      ).toBe(true);
    }

    const payments = webappSource('infra/repos/pgPatientPayments.ts');
    expect(payments).toContain('runWithDbOrganizationPrincipal');
    expect(payments).toContain('withTransaction');

    const folders = webappSource('infra/repos/pgClientMediaFolders.ts');
    expect(folders).toContain('getCurrentDbPrincipalOrganizationId');
    expect(folders).toContain('organizationId');
  });
});
