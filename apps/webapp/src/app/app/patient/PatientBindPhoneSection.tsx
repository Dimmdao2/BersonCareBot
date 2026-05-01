"use client";

import { PatientBindPhoneClient } from "@/app/app/patient/bind-phone/PatientBindPhoneClient";
import { patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";

type Props = {
  telegramId: string;
  maxId: string;
};

/** Блок привязки телефона на страницах кабинета (без редиректа на /bind-phone). Без SMS — только мессенджеры. */
export function PatientBindPhoneSection({ telegramId, maxId }: Props) {
  return (
    <section id="patient-bind-phone-section" className={patientSectionSurfaceClass}>
      <h2>Привяжите номер телефона</h2>
      <p className={patientMutedTextClass}>
        Для доступа к этому разделу нужен подтверждённый номер через Telegram или Max.
      </p>
      <PatientBindPhoneClient telegramId={telegramId} maxId={maxId} />
    </section>
  );
}
