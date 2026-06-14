"use client";

/**
 * PatientTabProgram — Wave 2 placeholder.
 * Wave 3: port existing treatment-program implementation as-is (separate story — do not redesign).
 */
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabProgram({ userId, header: _header }: Props) {
  return (
    <div className={doctorSectionCardClass}>
      <p className={doctorSectionTitleClass}>Программа</p>
      <p className="text-sm text-muted-foreground">
        {/* TODO(Wave 3): порт существующей реализации программы лечения as-is. */}
        Содержимое вкладки «Программа» — Wave 3.
      </p>
    </div>
  );
}
