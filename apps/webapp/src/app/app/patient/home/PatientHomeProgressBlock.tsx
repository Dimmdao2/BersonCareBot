import { patientHomeCardClass } from "./patientHomeCardStyles";

type Props = {
  practiceTarget: number;
  personalTierOk: boolean;
};

/** Phase 3: заглушка; реальные данные — Phase 5. */
export function PatientHomeProgressBlock({ practiceTarget, personalTierOk }: Props) {
  return (
    <section aria-labelledby="patient-home-progress-heading">
      <h2 id="patient-home-progress-heading" className="mb-2 text-base font-semibold">
        Прогресс
      </h2>
      <div className={patientHomeCardClass}>
        {!personalTierOk ?
          <p className="text-sm text-muted-foreground">
            Активируйте профиль пациента, чтобы видеть прогресс практик и серию дней.
          </p>
        : <>
            <p className="text-sm text-muted-foreground">
              Скоро здесь появится счётчик «сегодня выполнено» и серия дней. Цель на главной (из настроек):{" "}
              <span className="font-medium text-foreground">{practiceTarget}</span> практик в день.
            </p>
          </>
        }
      </div>
    </section>
  );
}
