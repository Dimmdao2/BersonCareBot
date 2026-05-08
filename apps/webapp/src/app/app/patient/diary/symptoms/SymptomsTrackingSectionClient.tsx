"use client";

import { useEffect, useState } from "react";
import { SymptomTrackingRow } from "./SymptomTrackingRow";
import { patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";

export function SymptomsTrackingSectionClient({
  trackings,
}: {
  trackings: { id: string; symptomTitle: string | null }[];
}) {
  const [rows, setRows] = useState(trackings);

  useEffect(() => {
    setRows(trackings);
  }, [trackings]);

  return (
    <section
      id="patient-symptoms-tracking-section"
      className={patientSectionSurfaceClass}
    >
      <h2 className="text-lg font-semibold">Отслеживаемые симптомы</h2>
      {rows.length > 0 ?
        <ul id="patient-symptoms-tracking-list" className="m-0 list-none space-y-3 p-0">
          {rows.map((t) => (
            <SymptomTrackingRow key={t.id} id={t.id} title={t.symptomTitle ?? "—"} />
          ))}
        </ul>
      : <p className={patientMutedTextClass}>Отслеживания симптомов назначает врач.</p>}
    </section>
  );
}
