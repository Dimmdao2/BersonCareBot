"use client";

import type { PatientHomeBlockCode } from "@/modules/patient-home/blocks";
import { patientHomeBlockRequiresItemList } from "@/modules/patient-home/blocks";
import { getPatientHomeBlockEditorMetadata } from "@/modules/patient-home/blockEditorMetadata";
import type { PatientHomeUnresolvedRef } from "@/modules/patient-home/patientHomeUnresolvedRefs";
import { describePatientHomeUnresolvedRef } from "@/modules/patient-home/patientHomeUnresolvedRefs";
import { cn } from "@/lib/utils";

export type PatientHomeBlockPreviewProps = {
  blockCode: PatientHomeBlockCode;
  isBlockVisible: boolean;
  visibleItemsCount: number;
  unresolvedRefs?: PatientHomeUnresolvedRef[];
};

export function PatientHomeBlockPreview({
  blockCode,
  isBlockVisible,
  visibleItemsCount,
  unresolvedRefs,
}: PatientHomeBlockPreviewProps) {
  const meta = getPatientHomeBlockEditorMetadata(blockCode);
  const needsItems = patientHomeBlockRequiresItemList(blockCode);

  const lines = (unresolvedRefs ?? []).map(describePatientHomeUnresolvedRef);

  if (!needsItems) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="patient-home-block-preview">
        <p className="text-foreground">{meta.emptyPreviewText}</p>
        <p className="text-muted-foreground text-xs">{meta.emptyRuntimeText}</p>
        {lines.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-xs text-destructive">
            {lines.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (!isBlockVisible) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground" data-testid="patient-home-block-preview">
        Блок скрыт. Пациенты его не видят.
        {lines.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-destructive">
            {lines.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (visibleItemsCount === 0) {
    return (
      <div className="space-y-2" data-testid="patient-home-block-preview">
        <p
          role="alert"
          className={cn("rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100")}
        >
          {meta.emptyPreviewText}
        </p>
        <p className="text-muted-foreground text-xs">{meta.emptyRuntimeText}</p>
        {lines.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-xs text-destructive">
            {lines.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm" data-testid="patient-home-block-preview">
      <p className="text-foreground">Видимых элементов в блоке: {visibleItemsCount}.</p>
      <p className="text-muted-foreground text-xs">{meta.emptyRuntimeText}</p>
      {lines.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4 text-xs text-destructive">
          {lines.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
