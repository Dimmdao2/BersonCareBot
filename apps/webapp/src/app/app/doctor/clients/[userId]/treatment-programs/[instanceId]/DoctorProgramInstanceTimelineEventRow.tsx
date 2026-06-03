"use client";

import { ChevronDown } from "lucide-react";
import type {
  TreatmentProgramEventDoctorTimelineLabels,
  TreatmentProgramEventRow,
} from "@/modules/treatment-program/types";
import {
  formatProgramChangedEventDetailLinesForDoctorRu,
  summarizeTreatmentProgramEventForDoctorRu,
} from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";

export function DoctorProgramInstanceTimelineEventRow(props: {
  event: TreatmentProgramEventRow;
  labels: TreatmentProgramEventDoctorTimelineLabels;
  createdAtLabel: string;
  whoLabel: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { event, labels, createdAtLabel, whoLabel, expanded, onToggleExpand } = props;
  const summary = summarizeTreatmentProgramEventForDoctorRu(event, labels);
  const detailLines =
    event.eventType === "program_changed" ? formatProgramChangedEventDetailLinesForDoctorRu(event) : [];
  const expandable = detailLines.length > 0;

  return (
    <li className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <span className="text-xs text-muted-foreground">{createdAtLabel}</span>
        {expandable ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-left hover:underline"
            aria-expanded={expanded}
            data-testid={`doctor-program-timeline-event-${event.id}`}
            onClick={onToggleExpand}
          >
            {summary}
            <ChevronDown
              className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : (
          <span className="font-medium">{summary}</span>
        )}
        {whoLabel ? <span className="text-xs text-muted-foreground">· {whoLabel}</span> : null}
      </div>
      {event.reason ? (
        <span className="mt-0.5 block text-xs text-foreground/90">Комментарий: {event.reason}</span>
      ) : null}
      {expandable && expanded ? (
        <ul
          className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-foreground/90"
          data-testid={`doctor-program-timeline-detail-${event.id}`}
        >
          {detailLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
