"use client";

import { useMemo, useState } from "react";
import type { PatientHomeBlockCode } from "@/modules/patient-home/blocks";
import { patientHomeBlockRequiresItemList } from "@/modules/patient-home/blocks";
import { getPatientHomeBlockDisplayTitle } from "@/modules/patient-home/blockEditorMetadata";
import type { PatientHomeUnresolvedRef } from "@/modules/patient-home/patientHomeUnresolvedRefs";
import type { PatientHomeEditorCandidateRow, PatientHomeEditorItemRow } from "@/modules/patient-home/patientHomeEditorDemo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PatientHomeBlockPreview } from "@/app/app/settings/patient-home/PatientHomeBlockPreview";
import { PatientHomeBlockEditorDialog } from "@/app/app/settings/patient-home/PatientHomeBlockEditorDialog";
import { cn } from "@/lib/utils";

export type PatientHomeBlockSettingsCardProps = {
  blockCode: PatientHomeBlockCode;
  isBlockVisible: boolean;
  /** Fallback, если не переданы initialItems. */
  visibleItemsCount: number;
  unresolvedRefs?: PatientHomeUnresolvedRef[];
  initialItems?: PatientHomeEditorItemRow[];
  initialCandidates?: PatientHomeEditorCandidateRow[];
};

export function PatientHomeBlockSettingsCard({
  blockCode,
  isBlockVisible,
  visibleItemsCount,
  unresolvedRefs,
  initialItems,
  initialCandidates,
}: PatientHomeBlockSettingsCardProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  /** Remount editor on each open so local state matches latest server props (avoids setState-in-effect). */
  const [editorSession, setEditorSession] = useState(0);
  const title = getPatientHomeBlockDisplayTitle(blockCode);
  const needsList = patientHomeBlockRequiresItemList(blockCode);

  const previewCount = useMemo(() => {
    if (initialItems) {
      return initialItems.filter((i) => i.isVisible && i.resolved).length;
    }
    return visibleItemsCount;
  }, [initialItems, visibleItemsCount]);

  return (
    <Card data-testid={`patient-home-settings-card-${blockCode}`}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            isBlockVisible ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100" : "bg-muted text-muted-foreground",
          )}
        >
          {isBlockVisible ? "Включён" : "Скрыт"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PatientHomeBlockPreview
          blockCode={blockCode}
          isBlockVisible={isBlockVisible}
          visibleItemsCount={previewCount}
          unresolvedRefs={unresolvedRefs}
        />
        <>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="w-fit"
            onClick={() => {
              setEditorSession((s) => s + 1);
              setEditorOpen(true);
            }}
          >
            Настроить
          </Button>
          <PatientHomeBlockEditorDialog
            key={editorSession}
            blockCode={blockCode}
            open={editorOpen}
            onOpenChange={setEditorOpen}
            initialBlockVisible={isBlockVisible}
            initialItems={needsList ? initialItems : undefined}
            initialCandidates={needsList ? initialCandidates : undefined}
          />
        </>
      </CardContent>
    </Card>
  );
}
