'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';
import { DoctorMobileSectionTabs } from '@/shared/ui/doctor/shell/DoctorMobileSectionTabs';
import { patientCardHref } from '../patientCardHref';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';
import { getEffectivePatientCardTabs, type PatientCardTabId } from './patientCardTabRegistry';

export { PATIENT_CARD_TABS } from './patientCardTabRegistry';
export type { PatientCardTabId } from './patientCardTabRegistry';

export function PatientCardDesktopTabs({
  activeTab,
  onTabChange,
  workspaceModules,
}: {
  activeTab: PatientCardTabId | null;
  onTabChange: (tab: PatientCardTabId) => void;
  workspaceModules?: WorkspaceModuleEffective;
}) {
  const tabs = getEffectivePatientCardTabs(workspaceModules);
  return (
    <nav
      id="doctor-patient-card-tabs"
      aria-label="Разделы карточки пациента"
      className="hidden gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          type="button"
          variant="ghost"
          aria-current={tab.id === activeTab ? 'page' : undefined}
          onClick={() => onTabChange(tab.id)}
          className={doctorSectionTabClass(tab.id === activeTab)}
        >
          {tab.label}
        </Button>
      ))}
    </nav>
  );
}

export function PatientCardMobileTabs({
  activeTab,
  onTabChange,
  workspaceModules,
}: {
  activeTab: PatientCardTabId | null;
  onTabChange: (tab: PatientCardTabId) => void;
  workspaceModules?: WorkspaceModuleEffective;
}) {
  return (
    <DoctorMobileSectionTabs
      tabs={getEffectivePatientCardTabs(workspaceModules)}
      activeTab={activeTab}
      onTabChange={onTabChange}
      ariaLabel="Разделы карточки пациента"
    />
  );
}

export function PatientCardRouteTabs({
  userId,
  variant,
  workspaceModules,
}: {
  userId: string;
  variant: 'desktop' | 'mobile';
  workspaceModules?: WorkspaceModuleEffective;
}) {
  const router = useRouter();
  const goToTab = (tab: PatientCardTabId) => router.push(patientCardHref(userId, { tab }));

  return variant === 'desktop' ? (
    <PatientCardDesktopTabs
      activeTab={null}
      onTabChange={goToTab}
      workspaceModules={workspaceModules}
    />
  ) : (
    <PatientCardMobileTabs
      activeTab={null}
      onTabChange={goToTab}
      workspaceModules={workspaceModules}
    />
  );
}
