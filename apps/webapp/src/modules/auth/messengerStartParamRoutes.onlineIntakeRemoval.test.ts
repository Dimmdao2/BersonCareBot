import { describe, expect, it } from 'vitest';
import { mapMaxStartParamToPatientPath } from './messengerStartParamRoutes';

describe('messenger start parameters after standalone intake removal', () => {
  it('rejects retired questionnaire parameters while preserving booking and messages', () => {
    expect(mapMaxStartParamToPatientPath('intake_lfk')).toBeNull();
    expect(mapMaxStartParamToPatientPath('intake-nutrition')).toBeNull();
    expect(mapMaxStartParamToPatientPath('booking')).toBe('/app/patient/booking');
    expect(mapMaxStartParamToPatientPath('messages')).toBe('/app/patient/messages');
  });
});
