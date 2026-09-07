import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';

export type PatientCardTabId = 'overview' | 'karta' | 'program' | 'files' | 'account';

export type PatientCardTab = Readonly<{ id: PatientCardTabId; label: string }>;

export const PATIENT_CARD_TABS: readonly PatientCardTab[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'karta', label: 'Карта' },
  { id: 'program', label: 'ЛФК' },
  { id: 'files', label: 'Файлы' },
  { id: 'account', label: 'Учётка' },
];

const LEGACY_PATIENT_CARD_TABS = new Set(['records', 'comms', 'finances']);

export function getEffectivePatientCardTabs(
  workspaceModules?: WorkspaceModuleEffective,
): readonly PatientCardTab[] {
  if (!workspaceModules) return PATIENT_CARD_TABS;
  return PATIENT_CARD_TABS.filter((tab) => {
    if (tab.id === 'program') return workspaceModules.rehabilitation;
    if (tab.id === 'karta') return workspaceModules.medical_record || workspaceModules.encounters;
    return true;
  });
}

/**
 * Resolves the existing query/legacy vocabulary against the same filtered registry rendered by
 * the card. `null` means a known direct tab was disabled and must use the frozen page-404 adapter.
 */
export function resolvePatientCardTab(
  tab: string | undefined,
  workspaceModules?: WorkspaceModuleEffective,
): PatientCardTabId | null {
  const requested =
    PATIENT_CARD_TABS.find((candidate) => candidate.id === tab)?.id ??
    (tab && LEGACY_PATIENT_CARD_TABS.has(tab) ? 'karta' : tab ? null : 'overview');
  if (requested === null) return 'overview';
  return getEffectivePatientCardTabs(workspaceModules).some(
    (candidate) => candidate.id === requested,
  )
    ? requested
    : null;
}
