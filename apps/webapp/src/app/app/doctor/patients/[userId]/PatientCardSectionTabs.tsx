'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';
import { DoctorMobileSectionTabs } from '@/shared/ui/doctor/shell/DoctorMobileSectionTabs';
import { patientCardHref } from '../patientCardHref';

export type PatientCardTabId = 'overview' | 'karta' | 'program' | 'files' | 'account';

export const PATIENT_CARD_TABS: ReadonlyArray<{ id: PatientCardTabId; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'karta', label: 'Карта' },
  { id: 'program', label: 'ЛФК' },
  { id: 'files', label: 'Файлы' },
  { id: 'account', label: 'Учётка' },
];

export function PatientCardDesktopTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: PatientCardTabId | null;
  onTabChange: (tab: PatientCardTabId) => void;
}) {
  return (
    <nav
      id="doctor-patient-card-tabs"
      aria-label="Разделы карточки пациента"
      className="hidden gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden"
    >
      {PATIENT_CARD_TABS.map((tab) => (
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
}: {
  activeTab: PatientCardTabId | null;
  onTabChange: (tab: PatientCardTabId) => void;
}) {
  return (
    <DoctorMobileSectionTabs
      tabs={PATIENT_CARD_TABS}
      activeTab={activeTab}
      onTabChange={onTabChange}
      ariaLabel="Разделы карточки пациента"
    />
  );
}

export function PatientCardRouteTabs({
  userId,
  variant,
}: {
  userId: string;
  variant: 'desktop' | 'mobile';
}) {
  const router = useRouter();
  const goToTab = (tab: PatientCardTabId) => router.push(patientCardHref(userId, { tab }));

  return variant === 'desktop' ? (
    <PatientCardDesktopTabs activeTab={null} onTabChange={goToTab} />
  ) : (
    <PatientCardMobileTabs activeTab={null} onTabChange={goToTab} />
  );
}
