"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { PatientReminderRuleJson } from "@/app/api/patient/reminders/reminderPatientJson";
import type { LfkComplex } from "@/modules/diaries/types";
import { ReminderCreateDialog } from "@/modules/reminders/components/ReminderCreateDialog";
import { LfkComplexCard } from "./LfkComplexCard";

export function LfkDiarySectionClient({
  complexes,
  remindersByComplexId,
}: {
  complexes: LfkComplex[];
  remindersByComplexId: Record<string, PatientReminderRuleJson>;
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
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
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
                  coverImageUrl={null}
                  hasReminder={Boolean(reminder)}
                  onBellClick={() => openForComplex(c)}
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
