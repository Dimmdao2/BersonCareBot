'use client';

import { useEffect, useState } from 'react';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';
import type { TreatmentProgramInstanceSummary } from '@/modules/treatment-program/types';
import { TreatmentProgramInstanceDetailClient } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient';
import {
  loadDoctorPatientProgramEditorBootstrap,
  type DoctorPatientProgramEditorBootstrap,
} from '../../loadDoctorPatientProgramEditorBootstrap';
import { pickOpenTreatmentProgramInstance } from '../../treatmentProgramInstanceOpen';
import { PatientProgramPanelLoader } from './program/PatientProgramPanelLoader';
import { ProgramHistoryModal } from './program/ProgramHistoryModal';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

type Props = {
  userId: string;
  header?: PatientCardHeader;
  active?: boolean;
  initialProgramInstances?: TreatmentProgramInstanceSummary[] | null;
};

export function PatientTabProgram({
  userId,
  header: _header,
  active,
  initialProgramInstances,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [failedProgramRequestKey, setFailedProgramRequestKey] = useState<string | null>(null);
  const [programLoadAttempt, setProgramLoadAttempt] = useState(0);
  const [editorBootstrap, setEditorBootstrap] =
    useState<DoctorPatientProgramEditorBootstrap | null>(null);
  const [resolvedProgramInstances, setResolvedProgramInstances] = useState<
    TreatmentProgramInstanceSummary[] | null
  >(initialProgramInstances ?? null);

  const knownProgramInstances = initialProgramInstances ?? resolvedProgramInstances;
  const activeProgramInstance = knownProgramInstances
    ? pickOpenTreatmentProgramInstance(knownProgramInstances)
    : null;
  const activeProgramInstanceId = activeProgramInstance?.id ?? null;
  const programRequestKey = activeProgramInstanceId
    ? `${activeProgramInstanceId}:${programLoadAttempt}`
    : null;
  const activeEditorBootstrap =
    editorBootstrap?.initial.id === activeProgramInstanceId ? editorBootstrap : null;

  // Resolve program summaries only when the tab is visible. The editor itself is loaded by
  // the second effect without navigating away from the existing PatientCardClient.
  useEffect(() => {
    if (!active || initialProgramInstances != null || resolvedProgramInstances != null) return;
    let cancelled = false;
    void fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/treatment-program-instances`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: TreatmentProgramInstanceSummary[] }) => {
        if (cancelled) return;
        setResolvedProgramInstances(data.ok && Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setResolvedProgramInstances([]);
      });
    return () => {
      cancelled = true;
    };
  }, [active, initialProgramInstances, resolvedProgramInstances, userId]);

  useEffect(() => {
    if (!active || !activeProgramInstanceId || !programRequestKey || activeEditorBootstrap) return;

    let cancelled = false;
    void loadDoctorPatientProgramEditorBootstrap(userId, activeProgramInstanceId)
      .then((bootstrap) => {
        if (cancelled) return;
        if (!bootstrap) {
          setFailedProgramRequestKey(programRequestKey);
          return;
        }
        setEditorBootstrap(bootstrap);
      })
      .catch(() => {
        if (cancelled) return;
        setFailedProgramRequestKey(programRequestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [
    active,
    activeEditorBootstrap,
    activeProgramInstanceId,
    programRequestKey,
    userId,
  ]);

  if (activeEditorBootstrap) {
    return <TreatmentProgramInstanceDetailClient {...activeEditorBootstrap} />;
  }

  const programLoadError =
    programRequestKey != null && failedProgramRequestKey === programRequestKey;
  const programLoading =
    knownProgramInstances == null || (activeProgramInstanceId != null && !programLoadError);

  if (programLoading) {
    // Skeleton mirroring the editor (toolbar + stage cards) — shown while the program route loads.
    return (
      <div className={cn(doctorSectionCardClass, 'gap-3')} aria-busy="true">
        <DoctorPanelLoading className="min-h-48" />
      </div>
    );
  }

  if (programLoadError) {
    return (
      <div className={cn(doctorSectionCardClass, 'items-center gap-3 text-center')}>
        <p className="text-sm text-muted-foreground">Не удалось загрузить программу.</p>
        <Button type="button" variant="outline" onClick={() => setProgramLoadAttempt((n) => n + 1)}>
          Попробовать снова
        </Button>
      </div>
    );
  }

  // PROG-12: no active program — show list/assign interface
  return (
    <div className={cn(doctorSectionCardClass, 'gap-4')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={doctorSectionTitleClass}>Программа лечения</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setHistoryOpen(true)}
        >
          История программ
        </Button>
      </div>

      <PatientProgramPanelLoader
        userId={userId}
        initialInstances={resolvedProgramInstances ?? []}
      />

      <ProgramHistoryModal open={historyOpen} onOpenChange={setHistoryOpen} userId={userId} />
    </div>
  );
}
