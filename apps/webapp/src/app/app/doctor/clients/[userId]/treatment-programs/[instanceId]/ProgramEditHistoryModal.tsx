"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/doctor/primitives/dialog";
import type {
  TreatmentProgramEventRow,
  TreatmentProgramEventDoctorTimelineLabels,
} from "@/modules/treatment-program/types";
import { DoctorProgramInstanceTimelineEventRow } from "./DoctorProgramInstanceTimelineEventRow";

function doctorTimelineWhoRu(
  actorId: string | null,
  opts: { currentUserId: string; patientUserId: string },
): string | null {
  if (!actorId) return null;
  if (actorId === opts.currentUserId) return "Вы";
  if (actorId === opts.patientUserId) return "Пациент";
  return "Врач";
}
import { doctorHistoryRowClass } from "@/shared/ui/doctor/doctorVisual";
import { formatBookingDateTimeShortStyleRu } from "@/shared/lib/formatBusinessDateTime";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createdAt: string;
  assignedByLabel: string | null;
  doctorTimelineEvents: TreatmentProgramEventRow[];
  eventLabels: TreatmentProgramEventDoctorTimelineLabels;
  appDisplayTimeZone: string;
  currentUserId: string;
  patientUserId: string;
  expandedTimelineEventIds: Set<string>;
  onToggleExpandEvent: (id: string) => void;
};

export function ProgramEditHistoryModal({
  open,
  onOpenChange,
  createdAt,
  assignedByLabel,
  doctorTimelineEvents,
  eventLabels,
  appDisplayTimeZone,
  currentUserId,
  patientUserId,
  expandedTimelineEventIds,
  onToggleExpandEvent,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>История правок программы</DialogTitle>
          <DialogDescription>Изменения плана и прохождение этапов.</DialogDescription>
        </DialogHeader>
        <ul className="list-none space-y-2 pl-0 text-sm">
          <li className={doctorHistoryRowClass}>
            <span className="text-xs text-muted-foreground">
              {formatBookingDateTimeShortStyleRu(createdAt, appDisplayTimeZone)}
            </span>
            <span className="ml-2 font-medium">Программа назначена</span>
            {assignedByLabel ? (
              <span className="ml-1 text-xs text-muted-foreground">· {assignedByLabel}</span>
            ) : null}
          </li>
          {doctorTimelineEvents.length === 0 ? (
            <li className="rounded-md border border-dashed border-border/70 px-2 py-2 text-sm text-muted-foreground">
              Дальше появятся изменения плана и прохождение этапов (отметки выполнения пунктов — в журнале
              выполнения).
            </li>
          ) : (
            doctorTimelineEvents.map((e) => {
              const who = doctorTimelineWhoRu(e.actorId, {
                currentUserId,
                patientUserId,
              });
              return (
                <DoctorProgramInstanceTimelineEventRow
                  key={e.id}
                  event={e}
                  labels={eventLabels}
                  createdAtLabel={formatBookingDateTimeShortStyleRu(e.createdAt, appDisplayTimeZone)}
                  whoLabel={who}
                  expanded={expandedTimelineEventIds.has(e.id)}
                  onToggleExpand={() => onToggleExpandEvent(e.id)}
                />
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
