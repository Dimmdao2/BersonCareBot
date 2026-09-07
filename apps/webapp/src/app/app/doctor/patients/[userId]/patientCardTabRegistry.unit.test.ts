import { describe, expect, it } from 'vitest';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';
import { getEffectivePatientCardTabs, resolvePatientCardTab } from './patientCardTabRegistry';

const ALL_MODULES_OFF = {
  medical_record: false,
  encounters: false,
  rehabilitation: false,
  direct_chat: false,
  program_comments: false,
  program_media: false,
  mailings: false,
  analytics: false,
  client_portal: false,
} satisfies WorkspaceModuleEffective;

describe('patient-card workspace projection', () => {
  it.each([
    { medical_record: false, encounters: false, karta: false },
    { medical_record: true, encounters: false, karta: true },
    { medical_record: false, encounters: true, karta: true },
    { medical_record: true, encounters: true, karta: true },
  ])('keeps Karte iff medical records or encounters are effective: %o', (scenario) => {
    const modules = { ...ALL_MODULES_OFF, ...scenario };
    const ids = getEffectivePatientCardTabs(modules).map((tab) => tab.id);

    expect(ids.includes('karta')).toBe(scenario.karta);
    expect(ids).toEqual(expect.arrayContaining(['overview', 'files', 'account']));
  });

  it('projects rehabilitation independently and rejects known disabled direct tabs', () => {
    const disabled = ALL_MODULES_OFF;
    const rehabilitation = { ...ALL_MODULES_OFF, rehabilitation: true };

    expect(getEffectivePatientCardTabs(disabled).map((tab) => tab.id)).not.toContain('program');
    expect(getEffectivePatientCardTabs(rehabilitation).map((tab) => tab.id)).toContain('program');
    expect(resolvePatientCardTab('program', disabled)).toBeNull();
    expect(resolvePatientCardTab('records', disabled)).toBeNull();
    expect(resolvePatientCardTab(undefined, disabled)).toBe('overview');
  });
});
