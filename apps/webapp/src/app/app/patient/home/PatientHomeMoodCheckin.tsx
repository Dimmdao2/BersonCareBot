import { patientHomeCardClass } from "./patientHomeCardStyles";

type Props = { personalTierOk: boolean };

/** Phase 3: заглушка; сохранение — Phase 6. */
export function PatientHomeMoodCheckin({ personalTierOk }: Props) {
  return (
    <section aria-labelledby="patient-home-mood-heading">
      <h2 id="patient-home-mood-heading" className="mb-2 text-base font-semibold">
        Как вы себя чувствуете?
      </h2>
      <div className={patientHomeCardClass}>
        {!personalTierOk ?
          <p className="text-sm text-muted-foreground">Чек-ин самочувствия будет доступен после активации профиля.</p>
        : <p className="text-sm text-muted-foreground">Скоро здесь можно будет отметить самочувствие по шкале 1–5.</p>}
      </div>
    </section>
  );
}
