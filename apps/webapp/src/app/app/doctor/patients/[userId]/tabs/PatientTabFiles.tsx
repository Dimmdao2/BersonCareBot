"use client";

/**
 * PatientTabFiles — Wave 2 placeholder.
 * Wave 3: two-panel (list+filters / preview + Скачать·Открыть·Привязать к визиту).
 * Wave 4: real backend — files table/model + upload/list/preview + link-to-visit.
 * Single source shared with visit files (Карта tab).
 */
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabFiles({ userId, header: _header }: Props) {
  return (
    <div className={doctorSectionCardClass}>
      <p className={doctorSectionTitleClass}>Файлы</p>
      <p className="text-sm text-muted-foreground">
        {/* TODO(Wave 3): двухпанельный UI (список+фильтры / превью). TODO(Wave 4): backend (файлы, загрузка, привязка к визиту). */}
        Содержимое вкладки «Файлы» — Wave 3.
      </p>
    </div>
  );
}
