import { describe, expect, it } from 'vitest';
import {
  validateDeclaredNoSurfaceClaims,
  validateMechanicBearingExports,
  runS4ProtectedActionCoverageCheck,
  runS4EntitlementCoverageCheck,
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
        message:
          'declared DECLARED_NO_SURFACE but has 4 registered write mapping(s): branding.save, branding.notification-templates.list, branding.notification-templates.save, branding.notification-templates.preview',
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

/**
 * 3.1/3.2: before this test, `check-s4-entitlement-coverage.ts` (`validateMechanicBearingExports`,
 * `staticBypassFindings`) was never invoked by anything `pnpm run ci`/`pnpm test` runs — `grep -rn
 * "check-s4-entitlement-coverage" package.json apps/webapp/package.json .github` found zero wiring.
 * The checker existed, was correct, and enforced nothing: a new unregistered export or a new direct
 * resolver call outside the approved boundary would pass every existing gate silently. Running the
 * full check here, against the real registry and the real repository tree, is what makes it a gate
 * again — no scripts/ or ci.yml edit needed, since vitest already runs this file in `pnpm run ci`.
 */
describe('runS4EntitlementCoverageCheck is wired into the test suite (was previously unreachable)', () => {
  it('reports zero findings for the real registry and the real repository tree', () => {
    const findings = runS4EntitlementCoverageCheck();
    expect(findings).toEqual([]);
  });
});

/**
 * 3.2 DoD: "падающий тест на неклассифицированную ручку" — adding a handler and not registering
 * it in the registry must turn this check red. `validateMechanicBearingExports` already carries
 * this logic (used to require a literal guard-call match in source text too, until the owner's
 * 29.07 ruling — "сноси машинерию, оставляй пользу" — removed that specific brittle check because
 * prettier's own formatting produced ten false positives; the inventory check below is what
 * survived that ruling and is exercised here as a real, always-run regression, not just the CLI
 * `--self-test` path).
 */
describe('validateMechanicBearingExports catches an unclassified handler (3.2 falling test)', () => {
  const file = 'src/app/api/doctor/newmechanic/route.ts';

  it('is green when every export in a declared file is mapped or exempted', () => {
    const sourceFor = () => "export async function GET() { return null; }";
    const findings = validateMechanicBearingExports(
      [
        {
          id: 'newmechanic.read',
          mechanic: 'courses',
          file,
          exportName: 'GET',
          method: 'GET',
          authContext: 'requireDoctorWorkspaceApiContext',
          guard: 'requireEntitlementForRead',
          serviceBoundary: 'deps.courses.listCoursesForDoctor',
        },
      ],
      [],
      sourceFor,
      [file],
    );
    expect(findings).toEqual([]);
  });

  it('goes red the moment a new export lands in that file without a mapping or an exemption', () => {
    // Same file, same declared coverage — but the file itself grew a second export (a POST
    // handler) that nobody added to PROTECTED_ACTION_MAPPINGS or PROTECTED_ACTION_EXEMPTIONS.
    // This is the exact shape of a real regression: a write path added mimo the registry.
    const sourceFor = () =>
      "export async function GET() { return null; }\nexport async function POST() { return null; }";
    const findings = validateMechanicBearingExports(
      [
        {
          id: 'newmechanic.read',
          mechanic: 'courses',
          file,
          exportName: 'GET',
          method: 'GET',
          authContext: 'requireDoctorWorkspaceApiContext',
          guard: 'requireEntitlementForRead',
          serviceBoundary: 'deps.courses.listCoursesForDoctor',
        },
      ],
      [],
      sourceFor,
      [file],
    );
    expect(findings).toEqual([
      {
        id: `${file}:POST`,
        message: 'unregistered exported action in mechanic-bearing file',
      },
    ]);
  });

  // The real registry against the real repository tree is covered above by
  // `runS4EntitlementCoverageCheck` (which calls this same function over every declared file).
});
