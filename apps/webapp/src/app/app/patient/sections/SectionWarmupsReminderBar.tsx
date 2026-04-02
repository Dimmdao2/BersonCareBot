"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PatientReminderRuleJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { Button } from "@/components/ui/button";
import { ReminderCreateDialog } from "@/modules/reminders/components/ReminderCreateDialog";

/**
 * S4.T05 / S4.T09: напоминание на весь раздел разминок (`content_section` / `warmups`).
 */
export function SectionWarmupsReminderBar({
  sectionTitle,
  existingRule,
}: {
  sectionTitle: string;
  existingRule: PatientReminderRuleJson | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        id="patient-warmups-reminder-actions"
        className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          Напоминать сделать разминку
        </Button>
        {existingRule ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
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
        linkedObjectId="warmups"
        contextTitle={sectionTitle}
        existingRule={existingRule}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
