"use client";

import { PatientBindPhoneClient } from "@/app/app/patient/bind-phone/PatientBindPhoneClient";

type Props = {
  telegramId: string;
  maxId: string;
};

/** Блок привязки телефона на страницах кабинета (без редиректа на /bind-phone). Без SMS — только мессенджеры. */
export function PatientBindPhoneSection({ telegramId, maxId }: Props) {
  return (
    <section id="patient-bind-phone-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
      <h2>Привяжите номер телефона</h2>
      <p className="text-muted-foreground text-sm">
        Для доступа к этому разделу нужен подтверждённый номер через Telegram или Max.
      </p>
      <PatientBindPhoneClient telegramId={telegramId} maxId={maxId} />
    </section>
  );
}
