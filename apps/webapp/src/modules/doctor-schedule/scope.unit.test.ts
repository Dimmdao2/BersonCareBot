import { describe, expect, it } from 'vitest';
import {
  doctorScheduleScopeQuery,
  resolveDoctorScheduleScopeState,
  type DoctorScheduleScopeBootstrap,
} from './scope';

const OWN_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';

function bootstrap(canManageAllSpecialists: boolean): DoctorScheduleScopeBootstrap {
  return {
    ownSpecialistId: OWN_ID,
    canManageAllSpecialists,
    specialists: [
      { id: OWN_ID, displayLabel: 'Свой специалист' },
      { id: OTHER_ID, displayLabel: 'Другой специалист' },
    ],
  };
}

describe('doctor schedule client scope', () => {
  it('ignores hostile deep-link scope for a normal doctor', () => {
    expect(resolveDoctorScheduleScopeState(bootstrap(false), 'specialist', OTHER_ID)).toEqual({
      scope: 'mine',
      specialistId: OWN_ID,
    });
  });

  it('accepts only a clinic specialist from the trusted bootstrap and emits the API contract', () => {
    const selected = resolveDoctorScheduleScopeState(bootstrap(true), 'specialist', OTHER_ID);
    expect(selected).toEqual({ scope: 'specialist', specialistId: OTHER_ID });
    expect(doctorScheduleScopeQuery(selected)).toEqual({
      scope: 'specialist',
      specialistId: OTHER_ID,
    });

    expect(
      resolveDoctorScheduleScopeState(
        bootstrap(true),
        'specialist',
        '90000000-0000-4000-8000-000000000009',
      ),
    ).toEqual({ scope: 'mine', specialistId: OWN_ID });
  });

  it('defaults a management-only clinic admin to the whole-clinic scope', () => {
    expect(
      resolveDoctorScheduleScopeState({ ...bootstrap(true), ownSpecialistId: null }, null, null),
    ).toEqual({ scope: 'clinic', specialistId: null });
  });
});
