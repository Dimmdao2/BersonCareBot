"use client";

/**
 * PatientTabRecords — Wave 2 placeholder.
 * Wave 3: real appointment history; «Оформить визит» bridges to Карта visit form.
 * Note: reputation/merge UI removed (moved to Учётка per owner decision 2026-06-14).
 */
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabRecords({ userId, header: _header }: Props) {
  return (
    <div className={doctorSectionCardClass}>
      <p className={doctorSectionTitleClass}>Записи</p>
      <p className="text-sm text-muted-foreground">
        {/* TODO(Wave 3): история записей (appointment_records), кнопка «Оформить визит» → Карта. */}
        Содержимое вкладки «Записи» — Wave 3.
      </p>
    </div>
  );
}
