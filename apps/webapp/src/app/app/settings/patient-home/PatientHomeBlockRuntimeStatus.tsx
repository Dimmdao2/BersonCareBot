"use client";

import type { PatientHomeEditorItemRow } from "@/modules/patient-home/patientHomeEditorDemo";
import { getPatientHomeBlockDisplayTitle } from "@/modules/patient-home/blockEditorMetadata";
import type { PatientHomeBlockCode } from "@/modules/patient-home/blocks";

export type PatientHomeBlockRuntimeStatusProps = {
  blockCode: PatientHomeBlockCode;
  blockVisible: boolean;
  items: PatientHomeEditorItemRow[];
};

export function PatientHomeBlockRuntimeStatus({ blockCode, blockVisible, items }: PatientHomeBlockRuntimeStatusProps) {
  const title = getPatientHomeBlockDisplayTitle(blockCode);
  const unresolved = items.filter((i) => !i.resolved);
  const visibleResolved = items.filter((i) => i.isVisible && i.resolved);

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm" data-testid="patient-home-runtime-status">
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
        <li>Блок для пациента: {blockVisible ? "включён" : "скрыт"}</li>
        <li>Видимых резолвящихся элементов: {visibleResolved.length}</li>
        <li>Неразрешённых целей: {unresolved.length}</li>
      </ul>
    </div>
  );
}
