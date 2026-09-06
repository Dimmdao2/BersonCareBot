'use client';

/**
 * PatientTabKarta — clinical core («Карта»).
 *
 * Симптомы · Диагнозы · Анамнез (`PatientClinicalSections`). История и запуск приёма
 * находятся в общей identity-шапке пациента и доступны на каждой вкладке; локального
 * блока приёмов на карте нет.
 *
 * Data:
 *   - Clinical state (жалобы/диагнозы/визиты): GET .../clinical (real).
 *   - Анамнез: GET/POST/PATCH .../anamnesis.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  AnamnesisState,
  ClinicalState,
  Visit,
} from '@/modules/patient-clinical/ports';
import { formatDoctorFioShort } from '@/shared/lib/fio';
import {
  PatientClinicalSections,
  type PatientClinicalComorbidity,
} from './karta/PatientClinicalSections';
import { EncounterViewModal } from './karta/EncounterViewModal';

type Props = {
  userId: string;
  header?: PatientCardHeader;
  initialClinicalState?: ClinicalState | null;
  initialVisits?: Visit[] | null;
  /** SSR-provided anamnesis — skips the initial client fetch when present. */
  initialAnamnesis?: AnamnesisState | null;
  /** SSR-provided active comorbidities — skips the Comorbidities component's initial fetch. */
  initialComorbidities?: PatientClinicalComorbidity[] | null;
  /** UI-5b composition slots. Only `leftContent`/`selectedAppointmentId` are still read —
   * the karta tab no longer has a second detail pane, so `rightContent`/`mobilePane`
   * flow through unused for backwards-compat with PatientCardClient's calling shape. */
  composition?: {
    leftContent: ReactNode;
    rightContent: ReactNode;
    selectedAppointmentId: string | null;
    onCloseSelectedVisit: () => void;
    mobilePane: 'master' | 'detail';
    onMobilePaneChange: (pane: 'master' | 'detail') => void;
  };
};

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface ClinicalApiResponse {
  ok: boolean;
  state: ClinicalState;
  visits: Visit[];
}

interface AnamnesisApiResponse {
  ok: boolean;
  anamnesis: AnamnesisState;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const EMPTY_ANAMNESIS: AnamnesisState = { trauma: [], illness: [], lifestyle: [] };

export function PatientTabKarta({
  userId,
  header,
  initialClinicalState,
  initialVisits,
  initialAnamnesis,
  initialComorbidities,
  composition,
}: Props) {
  const hasSsrClinical = initialClinicalState != null && initialVisits != null;

  // Clinical data — loaded from /api/doctor/patients/[userId]/clinical
  const [complaints, setComplaints] = useState<ActiveComplaint[]>(() =>
    hasSsrClinical ? initialClinicalState!.complaints : [],
  );
  const [diagnoses, setDiagnoses] = useState<ActiveDiagnosis[]>(() =>
    hasSsrClinical ? initialClinicalState!.diagnoses : [],
  );
  const [complaintHistory, setComplaintHistory] = useState<ActiveComplaint[]>(() =>
    hasSsrClinical ? initialClinicalState!.complaintHistory : [],
  );
  const [diagnosisHistory, setDiagnosisHistory] = useState<ActiveDiagnosis[]>(() =>
    hasSsrClinical ? initialClinicalState!.diagnosisHistory : [],
  );
  const [visits, setVisits] = useState<Visit[]>(() => (hasSsrClinical ? initialVisits! : []));
  const [isLoading, setIsLoading] = useState(!hasSsrClinical);
  const [fetchError, setFetchError] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() =>
    hasSsrClinical ? userId : null,
  );

  // Anamnesis data — loaded from /api/doctor/patients/[userId]/anamnesis
  const hasSsrAnamnesis = initialAnamnesis != null;
  const [anamnesis, setAnamnesis] = useState<AnamnesisState>(
    () => initialAnamnesis ?? EMPTY_ANAMNESIS,
  );
  const [anamnesisLoadedUserId, setAnamnesisLoadedUserId] = useState<string | null>(() =>
    hasSsrAnamnesis ? userId : null,
  );
  const [anamnesisError, setAnamnesisError] = useState(false);
  // fetchClinical is stable per userId — used on mount + after save
  const fetchClinical = useCallback(() => {
    fetch(`/api/doctor/patients/${userId}/clinical`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<ClinicalApiResponse>;
      })
      .then((data) => {
        setComplaints(data.state.complaints);
        setDiagnoses(data.state.diagnoses);
        setComplaintHistory(data.state.complaintHistory);
        setDiagnosisHistory(data.state.diagnosisHistory);
        setVisits(data.visits);
        setFetchError(false);
        setLoadedUserId(userId);
        setIsLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setLoadedUserId(userId);
        setIsLoading(false);
      });
  }, [userId]);

  const fetchAnamnesis = useCallback(() => {
    fetch(`/api/doctor/patients/${userId}/anamnesis`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<AnamnesisApiResponse>;
      })
      .then((data) => {
        setAnamnesis(data.anamnesis ?? EMPTY_ANAMNESIS);
        setAnamnesisError(false);
        setAnamnesisLoadedUserId(userId);
      })
      .catch(() => {
        setAnamnesisError(true);
        setAnamnesisLoadedUserId(userId);
      });
  }, [userId]);

  useEffect(() => {
    // Skip clinical fetch on mount when SSR data covers this userId.
    // fetchClinical() remains callable after mutations (onSaved callbacks).
    if (hasSsrClinical && loadedUserId === userId) {
      // Skip anamnesis fetch too when SSR data provided.
      if (!hasSsrAnamnesis) fetchAnamnesis();
      return;
    }
    fetchClinical();
    if (!hasSsrAnamnesis) fetchAnamnesis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchClinical, fetchAnamnesis]);

  // Treat as loading while userId doesn't match loaded data
  const isStale = loadedUserId !== userId;
  const loading = isStale || isLoading;
  // Anamnesis loading derived (mirrors clinical) — avoids synchronous setState in effect
  const anamnesisLoading = anamnesisLoadedUserId !== userId;
  const patientName = header
    ? formatDoctorFioShort(header.identity, header.identity.displayName)
    : null;
  const patientOnSupport = header?.support.isOnSupport ?? false;

  // A visit can be opened either from this tab's own summary/history (viewedVisitId) or
  // from outside (PatientTabRecords → composition.selectedAppointmentId). Both render the
  // same view modal; closing routes back to whichever source opened it.
  const externallySelectedVisit = composition?.selectedAppointmentId
    ? (visits.find((v) => v.canonicalAppointmentId === composition.selectedAppointmentId) ?? null)
    : null;
  const viewedVisit = externallySelectedVisit;

  const closeViewedVisit = useCallback(() => {
    if (composition?.selectedAppointmentId) composition.onCloseSelectedVisit();
  }, [composition]);

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {composition?.leftContent}
        <PatientClinicalSections
          userId={userId}
          patientName={patientName}
          patientOnSupport={patientOnSupport}
          complaints={complaints}
          complaintHistory={complaintHistory}
          diagnoses={diagnoses}
          diagnosisHistory={diagnosisHistory}
          loading={loading}
          fetchError={fetchError}
          onClinicalRefresh={fetchClinical}
          anamnesis={anamnesis}
          anamnesisLoading={anamnesisLoading}
          anamnesisError={anamnesisError}
          onAnamnesisRefresh={fetchAnamnesis}
          initialComorbidities={initialComorbidities ?? undefined}
        />
      </div>

      <EncounterViewModal
        visit={viewedVisit}
        nested={false}
        editHref={viewedVisit ? `/app/doctor/patients/${userId}/visits/${viewedVisit.id}` : ''}
        patientName={patientName}
        patientOnSupport={patientOnSupport}
        onClose={closeViewedVisit}
      />
    </>
  );
}
