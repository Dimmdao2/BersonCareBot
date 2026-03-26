"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Заглушка сценария «Создать из записи» (этап 9.3.3, полная реализация — этап 17).
 */
export function CreateClientFromRecordStub() {
  return (
    <section id="doctor-clients-create-from-record-stub" className="panel stack mb-4">
      <h2 className="text-lg font-semibold">Создать из записи на приём</h2>
      <p className="text-sm text-muted-foreground">
        Привязка карты пациента к записи будет добавлена на этапе 17. Сейчас откройте раздел записей и
        найдите нужного человека в списке клиентов ниже.
      </p>
      <a href="/app/doctor/appointments" className={cn(buttonVariants({ size: "sm" }), "w-fit")}>
        Перейти к записям
      </a>
    </section>
  );
}
