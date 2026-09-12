'use client';

import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { getPatientHomeBlockEditorMetadata } from '@/modules/patient-home/blockEditorMetadata';
import type { PatientHomeBlockRuntimeStatus } from '@/modules/patient-home/patientHomeRuntimeStatus';
import { cn } from '@/lib/utils';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

const KIND_LABEL: Record<PatientHomeBlockRuntimeStatus['kind'], string> = {
  hidden: 'Скрыт',
  empty: 'Пусто',
  ready: 'Готово',
};

function buildTooltip(
  status: PatientHomeBlockRuntimeStatus,
  patientPluralLabel: string,
  patientGenitive: string,
  appointmentAccusative: string,
): string {
  const meta = getPatientHomeBlockEditorMetadata(status.blockCode, { appointmentAccusative });
  const base = `В конфигурации видимых элементов: ${status.visibleConfiguredItems}. Дают карточку на главной при текущем CMS: ${status.visibleResolvedItems}. Неразрешённых ссылок (slug/id не в списках): ${status.unresolvedConfiguredItems}.`;
  if (status.kind === 'hidden') {
    return `${base} Блок скрыт — ${patientPluralLabel.toLowerCase()} его не увидят.`;
  }
  if (status.kind === 'empty') {
    return `${base} ${meta.emptyPreviewText} ${meta.emptyRuntimeText}`;
  }
  return `${base} Есть хотя бы одна видимая цель, которая отобразится на главной ${patientGenitive}.`;
}

export function PatientHomeBlockRuntimeStatusBadge({
  status,
}: {
  status: PatientHomeBlockRuntimeStatus;
}) {
  const { patientGenitive, patientPluralLabel, appointmentAccusative } = useDoctorPatientTerms();
  const variant =
    status.kind === 'ready' ? 'secondary' : status.kind === 'empty' ? 'destructive' : 'outline';

  return (
    <Badge
      variant={variant}
      className={cn(
        status.kind === 'ready' &&
          'border-emerald-600/35 bg-emerald-50 text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:text-emerald-50',
      )}
      title={buildTooltip(status, patientPluralLabel, patientGenitive, appointmentAccusative)}
      data-testid="patient-home-runtime-status-badge"
      data-runtime-kind={status.kind}
    >
      {KIND_LABEL[status.kind]}
    </Badge>
  );
}
