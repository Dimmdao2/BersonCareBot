"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { PatientRemindersMuteBar } from "./PatientRemindersMuteBar";

/** Пауза уведомлений — за ссылкой «Дополнительно». */
export function RemindersPageAdditionalSection({ muteUntilLabel }: { muteUntilLabel: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mt-8 border-t border-[var(--patient-border)] pt-4"
    >
      <CollapsibleTrigger
        type="button"
        className={cn(
          "inline p-0 text-left text-sm font-medium text-primary underline-offset-4",
          "cursor-pointer hover:underline",
          "bg-transparent outline-none focus-visible:underline",
        )}
      >
        Дополнительно
      </CollapsibleTrigger>
      <CollapsibleContent className="outline-none">
        <div className="pt-4">
          <PatientRemindersMuteBar muteUntilLabel={muteUntilLabel} className="mb-0" />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
