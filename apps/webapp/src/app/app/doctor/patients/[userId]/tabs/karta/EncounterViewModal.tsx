'use client';

/**
 * ENCOUNTERS-04/05 — compact read-only view of one encounter (визит).
 *
 * Editing moved to the canonical full-page editor
 * (`/app/doctor/patients/[userId]/visits/[visitId]`, built by the ENCOUNTER-PAGE
 * workstream) — this modal only reads the existing projection and links there. `nested`
 * is passed by the caller: true when opened from `EncounterHistoryModal` (already the
 * open layer), false when opened directly (this becomes the first/backdrop layer).
 */
import Link from 'next/link';
import type { Visit } from '@/modules/patient-clinical/ports';
import { cn } from '@/lib/utils';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { doctorSectionSubtitleClass } from '@/shared/ui/doctor/doctorVisual';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

export function EncounterViewModal({
  visit,
  nested,
  editHref,
  patientName,
  patientOnSupport,
  onClose,
}: {
  visit: Visit | null;
  nested: boolean;
  editHref: string;
  patientName: string | null;
  patientOnSupport: boolean;
  onClose: () => void;
}) {
  const { appointmentSingularLabel } = useDoctorPatientTerms();
  const durationLabel = visit?.duration
    ? /\D/.test(visit.duration)
      ? visit.duration
      : `${visit.duration} мин`
    : '';

  return (
    <DoctorModal
      open={visit !== null}
      onClose={onClose}
      nested={nested}
      size="md"
      bodyClassName="space-y-4"
      title={
        <DoctorModalStackedTitle
          label={appointmentSingularLabel}
          entity={visit?.date}
          patientName={patientName}
          patientOnSupport={patientOnSupport}
          patientVariant="context"
          entityClassName="text-primary"
        />
      }
      footer={
        visit ? (
          <Link href={editHref} className={buttonVariants({ variant: 'outline' })}>
            Изменить
          </Link>
        ) : undefined
      }
    >
      {visit ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-md px-1.5 py-px text-xs font-medium',
                visit.type === 'first'
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {visit.type === 'first' ? 'Первичный' : 'Повторный'}
            </span>
            {visit.package ? (
              <Badge
                variant="secondary"
                className="border border-violet-500/30 bg-violet-500/15 text-violet-900"
                title={visit.package.title}
              >
                {formatPatientPackageShortLabel(visit.package.displayNumber)}
              </Badge>
            ) : null}
            <span className={doctorSectionSubtitleClass}>
              {visit.time} · {visit.location}
              {durationLabel ? ` · ${durationLabel}` : ''}
            </span>
          </div>

          {visit.dynamics && visit.dynamics.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-foreground">Динамика симптомов</div>
              <div className="flex flex-col gap-1.5">
                {visit.dynamics.map((dyn) => (
                  <div
                    key={dyn.id}
                    className="rounded-md border border-border/70 bg-muted/15 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {dyn.priority ? <span className="font-bold text-destructive">!</span> : null}
                      {dyn.label}
                      <span className="ml-auto font-bold text-primary">
                        {dyn.from}/10 → {dyn.to}/10
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-foreground">{dyn.note}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {visit.sections?.map((s) => (
            <div key={s.title} className="flex flex-col gap-0.5">
              <div className="text-xs font-semibold text-foreground">{s.title}</div>
              <div className="whitespace-pre-wrap break-words text-sm text-foreground">
                {s.body}
              </div>
            </div>
          ))}

          {visit.files && visit.files.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {visit.files.map((f) => (
                <span
                  key={f.id}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                >
                  <span>{f.icon}</span>
                  <span>{f.name}</span>
                </span>
              ))}
              <span className={doctorSectionSubtitleClass}>— файлы, прикреплённые к визиту</span>
            </div>
          ) : null}
        </>
      ) : null}
    </DoctorModal>
  );
}
