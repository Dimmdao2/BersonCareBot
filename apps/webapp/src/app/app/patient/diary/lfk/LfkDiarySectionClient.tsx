"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { PatientReminderRuleJson } from "@/app/api/patient/reminders/reminderPatientJson";
import type { LfkComplex, LfkComplexExerciseLine } from "@/modules/diaries/types";
import { ReminderCreateDialog } from "@/modules/reminders/components/ReminderCreateDialog";
import { patientSectionSurfaceClass } from "@/shared/ui/patientVisual";
import { LfkComplexCard } from "./LfkComplexCard";

export function LfkDiarySectionClient({
  complexes,
  remindersByComplexId,
  exerciseLinesByComplexId = {},
}: {
  complexes: LfkComplex[];
  remindersByComplexId: Record<string, PatientReminderRuleJson>;
  exerciseLinesByComplexId?: Record<string, LfkComplexExerciseLine[]>;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeComplex, setActiveComplex] = useState<LfkComplex | null>(null);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const activeReminder = useMemo(() => {
    if (!activeComplex) return null;
    return remindersByComplexId[activeComplex.id] ?? null;
  }, [activeComplex, remindersByComplexId]);

  const openForComplex = (c: LfkComplex) => {
    setActiveComplex(c);
    setDialogOpen(true);
  };

  if (complexes.length === 0) {
    return null;
  }

  return (
    <>
      <section
        id="patient-lfk-complexes-section"
        className={patientSectionSurfaceClass}
      >
        <h2 className="text-lg font-semibold">Комплексы</h2>
        <ul id="patient-lfk-complexes-list" className="m-0 list-none space-y-3 p-0">
          {complexes.map((c) => {
            const reminder = remindersByComplexId[c.id];
            return (
              <li key={c.id} id={`patient-lfk-complex-item-${c.id}`}>
                <LfkComplexCard
                  complex={c}
                  description={c.diagnosisText}
                  hasReminder={Boolean(reminder)}
                  onBellClick={() => openForComplex(c)}
                  onEditScheduleClick={reminder ? () => openForComplex(c) : undefined}
                  exerciseLines={exerciseLinesByComplexId[c.id]}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {activeComplex ? (
        <ReminderCreateDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setActiveComplex(null);
          }}
          linkedObjectType="lfk_complex"
          linkedObjectId={activeComplex.id}
          contextTitle={activeComplex.title?.trim() || "ЛФК"}
          existingRule={activeReminder}
          onSaved={refresh}
        />
      ) : null}
    </>
  );
}
