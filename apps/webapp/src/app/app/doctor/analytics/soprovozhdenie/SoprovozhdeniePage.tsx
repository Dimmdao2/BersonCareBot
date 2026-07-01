"use client";

/**
 * Вкладка «Сопровождение» агрегированной аналитики.
 *
 * MVP: placeholder — показывает ключевые области метрик сопровождения.
 * Владелец определит точные метрики и источники данных на следующем итерации.
 *
 * Будущие данные:
 *  - Выполнение программ: program-day-activity API или program metrics
 *  - Активные на сопровождении: счётчик isOnSupport клиентов + динамика
 *  - Использование программ: назначено / выполнено / среднее за период
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";

type Props = {
  /** Родительный падеж мн.ч. из настройки patient_label: «пациентов» или «клиентов». */
  patientGenPlural?: string;
};

export function SoprovozhdeniePage({ patientGenPlural = "пациентов" }: Props) {
  // Творительный падеж: «пациентами» / «клиентами».
  const patientInstr = patientGenPlural === "клиентов" ? "клиентами" : "пациентами";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Выполнение программ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Данные о выполнении программ {patientInstr} появятся здесь.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Активные на сопровождении</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Количество {patientGenPlural} на активном сопровождении и динамика.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Использование программ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Назначено программ, выполнено, среднее выполнение за период.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Раздел в разработке. Метрики сопровождения будут добавлены в следующей итерации.
      </p>
    </div>
  );
}
