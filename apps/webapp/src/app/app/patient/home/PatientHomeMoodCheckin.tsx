import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass } from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";

type Props = { personalTierOk: boolean; anonymousGuest: boolean };

/** Phase 3: заглушка; сохранение — Phase 6. */
export function PatientHomeMoodCheckin({ personalTierOk, anonymousGuest }: Props) {
  return (
    <section aria-labelledby="patient-home-mood-heading">
      <h2 id="patient-home-mood-heading" className="mb-2 text-base font-semibold">
        Как вы себя чувствуете?
      </h2>
      <div className={patientHomeCardClass}>
        {anonymousGuest ?
          <p className="text-sm text-muted-foreground">
            <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
              Войдите
            </Link>
            , чтобы отмечать самочувствие.
          </p>
        : !personalTierOk ?
          <p className="text-sm text-muted-foreground">Чек-ин самочувствия будет доступен после активации профиля.</p>
        : <p className="text-sm text-muted-foreground">Скоро здесь можно будет отметить самочувствие по шкале 1–5.</p>}
      </div>
    </section>
  );
}
