'use client';

/**
 * ENCOUNTERS-04 — full chronological visit history, one `DoctorModal` layer above the
 * «Карта» tab. A row opens the compact visit view as the next stacked layer
 * (`EncounterViewModal`), keeping the patient card underneath the whole stack.
 */
import type { Visit } from '@/modules/patient-clinical/ports';
import { cn } from '@/lib/utils';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { doctorSectionSubtitleClass } from '@/shared/ui/doctor/doctorVisual';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { capitalizeAppointmentForm } from '@/modules/system-settings/patientTerms';

export function EncounterHistoryModal({
  open,
  onClose,
  visits,
  patientName,
  patientOnSupport,
  onOpenVisit,
}: {
  open: boolean;
  onClose: () => void;
  visits: Visit[];
  patientName: string | null;
  patientOnSupport: boolean;
  onOpenVisit: (visitId: string) => void;
}) {
  const { appointmentGenPlural } = useDoctorPatientTerms();
  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={
        <DoctorModalStackedTitle
          label={`История ${appointmentGenPlural}`}
          patientName={patientName}
          patientOnSupport={patientOnSupport}
          patientVariant="context"
        />
      }
      size="lg"
      bodyVariant="list"
    >
      {visits.length === 0 ? (
        <p
          className={cn(
            doctorSectionSubtitleClass,
            'px-[var(--doctor-list-inline-padding,18px)] py-4',
          )}
        >
          {capitalizeAppointmentForm(appointmentGenPlural)} пока нет.
        </p>
      ) : (
        <DoctorDnaFlatList>
          {visits.map((visit) => (
            <li key={visit.id}>
              <button
                type="button"
                className={cn(
                  doctorDnaFlatListRowClass,
                  doctorDnaFlatListClickableClass,
                  'w-full items-start text-left',
                )}
                onClick={() => onOpenVisit(visit.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className={doctorDnaFlatListPrimaryClass}>
                    {visit.date}
                    <span
                      className={cn(
                        'ml-2 rounded-md px-1.5 py-px text-xs font-medium',
                        visit.type === 'first'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {visit.type === 'first' ? 'Первичный' : 'Повторный'}
                    </span>
                  </span>
                  <span className={cn(doctorDnaFlatListMetaClass, 'mt-0.5')}>
                    {visit.time} · {visit.location}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </DoctorDnaFlatList>
      )}
    </DoctorModal>
  );
}
