import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('scheduler scripts', () => {
  it('does not schedule the retired daily bot reminder', () => {
    const scripts = JSON.parse(readFileSync(join(dir, 'scripts.json'), 'utf8')) as Array<{
      steps?: Array<{ action?: string }>;
    }>;
    const actions = scripts.flatMap((script) => script.steps?.map((step) => step.action) ?? []);

    expect(actions).not.toContain('patient_home.morningWarmupPing');
    expect(
      existsSync(join(dir, '../../kernel/domain/executor/handlers/patientHomeMorningPing.ts')),
    ).toBe(false);
    expect(
      readFileSync(join(dir, '../../kernel/domain/executor/executeAction.ts'), 'utf8'),
    ).not.toContain('patient_home.morningWarmupPing');
    expect(existsSync(join(dir, '../../infra/db/repos/patientHomeMorningPing.ts'))).toBe(false);
    expect(
      existsSync(
        join(
          dir,
          '../../../../webapp/src/app/app/settings/patient-home/PatientHomeMorningPingPanel.tsx',
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        join(dir, '../../../../webapp/src/modules/patient-home/patientHomeMorningPingSettings.ts'),
      ),
    ).toBe(false);
    expect(
      readFileSync(join(dir, '../../../../webapp/src/modules/system-settings/types.ts'), 'utf8'),
    ).not.toContain('patient_home_morning_ping');
  });
});
