"use client";

/**
 * PatientTabOverview — Wave 2 placeholder.
 * Wave 3: signals, symptoms, exercise calendar, notes, tasks, program snippets, messages.
 */
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabOverview({ userId, header: _header }: Props) {
  return (
    <div className={doctorSectionCardClass}>
      <p className={doctorSectionTitleClass}>Обзор</p>
      <p className="text-sm text-muted-foreground">
        {/* TODO(Wave 3): сигналы, актуальные симптомы, динамика, выполнение упражнений, заметки, задачи, программа + комментарии, сообщения. */}
        Содержимое вкладки «Обзор» — Wave 3.
      </p>
    </div>
  );
}
