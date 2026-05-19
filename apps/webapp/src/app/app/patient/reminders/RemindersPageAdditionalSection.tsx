"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { patientCardClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { PatientRemindersMuteBar } from "./PatientRemindersMuteBar";

type ProjectionStats = {
  total: number;
  seen: number;
  unseen: number;
};

type Props = {
  muteUntilLabel: string | null;
  projectionStats: ProjectionStats;
};

/** Пауза уведомлений и статистика за 30 дней — внизу страницы, за ссылкой «Дополнительно». */
export function RemindersPageAdditionalSection({ muteUntilLabel, projectionStats }: Props) {
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
        <div className="flex flex-col gap-4 pt-4">
          <PatientRemindersMuteBar muteUntilLabel={muteUntilLabel} className="mb-0" />
          <Card className={patientCardClass}>
            <CardContent className="pb-4 pt-4">
              <p
                className={cn(
                  patientMutedTextClass,
                  "mb-2 text-xs font-semibold uppercase tracking-wide",
                )}
              >
                Уведомления за 30 дней
              </p>
              <p className={cn(patientMutedTextClass, "mb-3 text-xs")}>
                По напоминаниям из бота и приложения.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  <span className="font-medium">{projectionStats.total}</span>{" "}
                  <span className={patientMutedTextClass}>отправлено</span>
                </span>
                <span>
                  <span className="font-medium">{projectionStats.seen}</span>{" "}
                  <span className={patientMutedTextClass}>просмотрено</span>
                </span>
                <span>
                  <span className="font-medium">{projectionStats.unseen}</span>{" "}
                  <span className={patientMutedTextClass}>без открытия</span>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
