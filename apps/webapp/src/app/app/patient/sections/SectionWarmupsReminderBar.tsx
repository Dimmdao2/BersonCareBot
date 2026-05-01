"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PatientReminderRuleJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { Button } from "@/components/ui/button";
import { ReminderCreateDialog } from "@/modules/reminders/components/ReminderCreateDialog";
import { cn } from "@/lib/utils";
import { patientPrimaryActionClass, patientSecondaryActionClass } from "@/shared/ui/patientVisual";

/**
 * Напоминание на весь CMS-раздел разминок: `content_section` и slug канона разминок (см. `warmupsSection.ts`).
 */
export function SectionWarmupsReminderBar({
  sectionTitle,
  existingRule,
  linkedObjectId,
}: {
  sectionTitle: string;
  existingRule: PatientReminderRuleJson | null;
  linkedObjectId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        id="patient-warmups-reminder-actions"
        className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <Button type="button" className={cn(patientPrimaryActionClass, "w-full sm:w-auto")} onClick={() => setOpen(true)}>
          Напоминать сделать разминку
        </Button>
        {existingRule ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(patientSecondaryActionClass, "w-full sm:w-auto")}
            onClick={() => setOpen(true)}
          >
            Изменить расписание
          </Button>
        ) : null}
      </div>
      <ReminderCreateDialog
        open={open}
        onOpenChange={setOpen}
        linkedObjectType="content_section"
        linkedObjectId={linkedObjectId}
        contextTitle={sectionTitle}
        existingRule={existingRule}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
