"use client";

/**
 * PatientTabKarta — Wave 2 placeholder.
 * Wave 3: visit history list + «+ Новый визит» panel; faithful to wireframe.
 * Wave 4: clinical data model (visit/complaint/diagnosis/file) + create-visit backend.
 */
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabKarta({ userId, header: _header }: Props) {
  return (
    <div className={doctorSectionCardClass}>
      <p className={doctorSectionTitleClass}>Карта</p>
      <p className="text-sm text-muted-foreground">
        {/* TODO(Wave 3): история визитов + «+ Новый визит», жалобы, диагнозы, файлы визита. */}
        Содержимое вкладки «Карта» — Wave 3.
      </p>
    </div>
  );
}
