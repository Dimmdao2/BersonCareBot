"use client";

/**
 * PatientProgramPanelLoader — client wrapper that fetches published treatment-program
 * templates and then renders the reusable PatientTreatmentProgramsPanel.
 *
 * Decisions:
 *  - PatientTreatmentProgramsPanel is a cleanly importable client component that only
 *    needs patientUserId + templates array; it self-fetches the instance list via
 *    /api/doctor/clients/:userId/treatment-program-instances.
 *  - Templates are loaded here via /api/doctor/treatment-program-templates?status=published
 *    (existing endpoint, no new routes needed).
 */

import { useEffect, useState } from "react";
import { PatientTreatmentProgramsPanel } from "@/app/app/doctor/clients/PatientTreatmentProgramsPanel";

type TemplateOption = { id: string; title: string };

type Props = { userId: string };

export function PatientProgramPanelLoader({ userId }: Props) {
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [templatesError, setTemplatesError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/doctor/treatment-program-templates?status=published")
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: TemplateOption[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.items)) {
          setTemplates(data.items);
        } else {
          setTemplates([]);
          setTemplatesError(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTemplates([]);
          setTemplatesError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (templates === null) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <>
      {templatesError ? (
        <p className="mb-2 text-xs text-destructive" role="alert">
          Не удалось загрузить шаблоны программ.
        </p>
      ) : null}
      <PatientTreatmentProgramsPanel patientUserId={userId} templates={templates} />
    </>
  );
}
