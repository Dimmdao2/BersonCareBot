'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';
import { DoctorMobileSectionTabs } from '@/shared/ui/doctor/shell/DoctorMobileSectionTabs';
import { patientCardHref } from '../patientCardHref';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';
import { getEffectivePatientCardTabs, type PatientCardTabId } from './patientCardTabRegistry';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import {
  doctorClientTabsScrollClass,
  doctorClientTabTriggerClass,
} from '@/app/app/doctor/clients/doctorClientCardChrome';
import { cn } from '@/lib/utils';

export { PATIENT_CARD_TABS } from './patientCardTabRegistry';
export type { PatientCardTabId } from './patientCardTabRegistry';

export function PatientCardDesktopTabs({
  activeTab,
  onTabChange,
  workspaceModules,
  placement = 'card',
}: {
  activeTab: PatientCardTabId | null;
  onTabChange: (tab: PatientCardTabId) => void;
  workspaceModules?: WorkspaceModuleEffective;
  placement?: 'card' | 'header';
}) {
  const { patientGenitive } = useDoctorPatientTerms();
  const effectiveTabs = getEffectivePatientCardTabs(workspaceModules);
  const tabs: ReadonlyArray<{
    id: PatientCardTabId;
    label: string;
    active: boolean;
  }> = [
    {
      id: 'overview',
      label: `Карта ${patientGenitive}`,
      active: activeTab === 'overview' || activeTab === 'karta',
    },
    ...(effectiveTabs.some((tab) => tab.id === 'program')
      ? [{ id: 'program' as const, label: 'ЛФК', active: activeTab === 'program' }]
      : []),
    {
      id: 'files',
      label: 'Профиль',
      active: activeTab === 'files' || activeTab === 'account',
    },
  ];

  return (
    <nav
      id="doctor-patient-card-tabs"
      aria-label={`Разделы карточки ${patientGenitive}`}
      className={cn(
        placement === 'card' ? cn(doctorClientTabsScrollClass, 'border-t border-b-0') : 'gap-0.5',
        'hidden overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden',
      )}
    >
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          type="button"
          variant="ghost"
          aria-current={tab.active ? 'page' : undefined}
          onClick={() => onTabChange(tab.id)}
          className={
            placement === 'header'
              ? doctorSectionTabClass(tab.active)
              : cn(
                  doctorClientTabTriggerClass,
                  'h-auto border-b-2 text-sm font-medium',
                  tab.active
                    ? 'border-x-transparent border-t-transparent border-b-primary text-primary hover:bg-primary/5 hover:text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )
          }
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
  const { patientGenitive } = useDoctorPatientTerms();
  return (
    <DoctorMobileSectionTabs
      tabs={getEffectivePatientCardTabs(workspaceModules)}
      activeTab={activeTab}
      onTabChange={onTabChange}
      ariaLabel={`Разделы карточки ${patientGenitive}`}
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
      placement="header"
    />
  ) : (
    <PatientCardMobileTabs
      activeTab={null}
      onTabChange={goToTab}
      workspaceModules={workspaceModules}
    />
  );
}
