import { describe, expect, it } from 'vitest';
import {
  expandAppliedMigrationVersions,
  inspectMigrationReconciliations,
  type MigrationFile,
} from './migrate.js';

function migration(version: string): MigrationFile {
  const [scope, fileName] = version.split(':');
  if (!scope || !fileName) throw new Error(`invalid fixture version ${version}`);
  return { scope, fileName, filePath: `/fixture/${fileName}`, version };
}

describe('integrator migration forward reconciliation', () => {
  const source = migration('core:20260708_0001_old.sql');
  const forward = migration('core:20260814_0001_forward.sql');

  it('treats an applied forward migration as evidence for its superseded source', () => {
    const reconciliations = inspectMigrationReconciliations(
      [source, forward],
      new Map([
        [source.version, 'SELECT 1;'],
        [
          forward.version,
          `-- RECONCILES-INTEGRATOR-MIGRATION: ${source.version}\nSELECT 1;`,
        ],
      ]),
    );

    expect(expandAppliedMigrationVersions(new Set([forward.version]), reconciliations)).toEqual(
      new Set([forward.version, source.version]),
    );
  });

  it('rejects an unknown or non-forward source instead of silently skipping migration SQL', () => {
    expect(() =>
      inspectMigrationReconciliations(
        [forward],
        new Map([
          [
            forward.version,
            '-- RECONCILES-INTEGRATOR-MIGRATION: core:20260708_0001_missing.sql',
          ],
        ]),
      ),
    ).toThrow('integrator_migration_reconciliation_unknown_source');

    expect(() =>
      inspectMigrationReconciliations(
        [source, forward],
        new Map([
          [source.version, `-- RECONCILES-INTEGRATOR-MIGRATION: ${forward.version}`],
        ]),
      ),
    ).toThrow('integrator_migration_reconciliation_not_forward');
  });
});
