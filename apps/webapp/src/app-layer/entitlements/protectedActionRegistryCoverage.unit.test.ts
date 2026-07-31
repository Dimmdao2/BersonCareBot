import { describe, expect, it } from 'vitest';
import {
  validateDeclaredNoSurfaceClaims,
  runS4ProtectedActionCoverageCheck,
} from '../../../scripts/check-s4-entitlement-coverage';
import { DECLARED_NO_SURFACE, PROTECTED_ACTION_MAPPINGS } from './protectedActionRegistry';

describe('DECLARED_NO_SURFACE catches a false "no write surface" claim', () => {
  it('fails when a mechanic is marked no-surface while a write mapping is registered for it', () => {
    // 4a.5: this is the exact regression this checker exists to prevent — `branding` and
    // `exercise_catalog` were both marked here while `saveOrgBranding`/the exercise-catalog
    // actions already existed and were later wired into PROTECTED_ACTION_MAPPINGS.
    const falselyDeclared = { ...DECLARED_NO_SURFACE, branding: 'поверхности записи нет' };

    const findings = validateDeclaredNoSurfaceClaims(PROTECTED_ACTION_MAPPINGS, falselyDeclared);

    expect(findings).toEqual([
      {
        id: 'branding',
        message: 'declared DECLARED_NO_SURFACE but has 1 registered write mapping(s): branding.save',
      },
    ]);
  });

  it('stays clean for the real registry: no DECLARED_NO_SURFACE mechanic has a registered mapping', () => {
    expect(validateDeclaredNoSurfaceClaims(PROTECTED_ACTION_MAPPINGS)).toEqual([]);
  });

  it('registers real write mappings for branding and the exercise catalog instead of declaring no surface', () => {
    expect(DECLARED_NO_SURFACE).not.toHaveProperty('branding');
    expect(DECLARED_NO_SURFACE).not.toHaveProperty('exercise_catalog');
    expect(PROTECTED_ACTION_MAPPINGS.some((mapping) => mapping.id === 'branding.save')).toBe(true);
    expect(
      PROTECTED_ACTION_MAPPINGS.some((mapping) => mapping.id === 'exercise-catalog.save'),
    ).toBe(true);
  });

  it('drops the struck-out "proactive insights" mechanic from the registry entirely', () => {
    expect(DECLARED_NO_SURFACE).not.toHaveProperty('proactive_insights');
    expect(
      PROTECTED_ACTION_MAPPINGS.some((mapping) =>
        (Array.isArray(mapping.mechanic) ? mapping.mechanic : [mapping.mechanic]).includes(
          // @ts-expect-error -- proactive_insights is no longer a valid OrgMechanic
          'proactive_insights',
        ),
      ),
    ).toBe(false);
  });
});

describe('runS4ProtectedActionCoverageCheck on the real registry', () => {
  it('does not report the branding/exercise-catalog false no-surface findings this change fixed', () => {
    const findings = runS4ProtectedActionCoverageCheck();
    const ids = findings.map((finding) => finding.id);
    expect(ids).not.toContain('branding');
    expect(ids).not.toContain('exercise_catalog');
    expect(ids).not.toContain('proactive_insights');
  });
});
