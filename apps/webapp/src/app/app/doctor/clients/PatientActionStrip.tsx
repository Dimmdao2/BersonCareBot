'use client';

import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Button } from '@/shared/ui/doctor/primitives/button';
import type { DoctorClientProgramCardAggregates } from '@/modules/doctor-client-card/types';
import type { DoctorClientTabId } from '@/modules/doctor-client-card/types';
import {
  doctorClientActionChipClass,
  doctorClientActionStripChipsClass,
  doctorClientActionStripClass,
  doctorClientTabBadgeClass,
} from './doctorClientCardChrome';

type ChipVariant = 'default' | 'destructive' | 'outline' | 'secondary';

type PatientActionStripProps = {
  pendingTestsCount: number;
  chatUnreadCount: number;
  aggregates: DoctorClientProgramCardAggregates;
  openTasksCount?: number;
  onNavigateTab: (tab: DoctorClientTabId) => void;
  onNavigateAnchor: (anchorId: string) => void;
};

export function PatientActionStrip({
  pendingTestsCount,
  chatUnreadCount,
  aggregates,
  openTasksCount = 0,
  onNavigateTab,
  onNavigateAnchor,
}: PatientActionStripProps) {
  const chips: { key: string; label: string; variant: ChipVariant; onClick: () => void }[] = [];

  if (pendingTestsCount > 0) {
    chips.push({
      key: 'tests',
      label: `К проверке · ${pendingTestsCount}`,
      variant: 'default',
      onClick: () => {
        onNavigateTab('program');
        onNavigateAnchor('doctor-client-section-pending-program-tests');
      },
    });
  }
  if (aggregates.newCommentsCount > 0) {
    chips.push({
      key: 'comments',
      label: `Новые комментарии · ${aggregates.newCommentsCount}`,
      variant: 'default',
      onClick: () => {
        onNavigateTab('program');
        onNavigateAnchor('doctor-client-section-program-inbox');
      },
    });
  }
  if (aggregates.patientMediaCount > 0) {
    chips.push({
      key: 'media',
      label: `Медиа от пациента · ${aggregates.patientMediaCount}`,
      variant: 'default',
      onClick: () => {
        onNavigateTab('program');
        onNavigateAnchor('doctor-client-section-program-inbox');
      },
    });
  }
  if (chatUnreadCount > 0) {
    chips.push({
      key: 'chat',
      label: `Сообщение в чате · ${chatUnreadCount}`,
      variant: 'destructive',
      onClick: () => {
        onNavigateTab('communications');
        onNavigateAnchor('doctor-client-section-communications');
      },
    });
  }
  if (aggregates.planNotOpened) {
    chips.push({
      key: 'plan',
      label: 'План не открыт',
      variant: 'outline',
      onClick: () => onNavigateTab('overview'),
    });
  }
  if (openTasksCount > 0) {
    chips.push({
      key: 'tasks',
      label: `Задачи · ${openTasksCount}`,
      variant: 'secondary',
      onClick: () => {
        onNavigateTab('overview');
        onNavigateAnchor('doctor-client-section-tasks');
      },
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className={doctorClientActionStripClass}>
      <div className={doctorClientActionStripChipsClass}>
        {chips.map((chip) => (
          <Button
            key={chip.key}
            type="button"
            variant={chip.variant}
            size="sm"
            className={doctorClientActionChipClass}
            onClick={chip.onClick}
          >
            {chip.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function programTabBadgeCount(
  pendingTestsCount: number,
  aggregates: DoctorClientProgramCardAggregates,
): number {
  return pendingTestsCount + aggregates.newCommentsCount + aggregates.patientMediaCount;
}

export function ProgramTabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="secondary" className={doctorClientTabBadgeClass}>
      {count}
    </Badge>
  );
}
