import Link from "next/link";
import { Flame } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass } from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";

type Props = {
  practiceTarget: number;
  personalTierOk: boolean;
  anonymousGuest: boolean;
  progress: { todayDone: number; streak: number } | null;
};

export function PatientHomeProgressBlock({ practiceTarget, personalTierOk, anonymousGuest, progress }: Props) {
  const displayDone =
    progress && practiceTarget > 0 ? Math.min(progress.todayDone, practiceTarget) : progress?.todayDone ?? 0;
  const pct =
    practiceTarget > 0 ? Math.min(100, Math.round((displayDone / practiceTarget) * 100)) : 0;

  return (
    <section aria-labelledby="patient-home-progress-heading">
      <h2 id="patient-home-progress-heading" className="mb-2 text-base font-semibold">
        Прогресс
      </h2>
      <div className={patientHomeCardClass}>
        {anonymousGuest ?
          <p className="text-sm text-muted-foreground">
            <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
              Войдите
            </Link>
            , чтобы отслеживать прогресс практик и серию дней.
          </p>
        : !personalTierOk ?
          <p className="text-sm text-muted-foreground">
            Активируйте профиль пациента, чтобы видеть прогресс практик и серию дней.
          </p>
        : progress ?
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Сегодня</span>
              <span className="font-medium tabular-nums text-foreground" aria-label={`Выполнено практик сегодня: ${progress.todayDone}, цель ${practiceTarget}`}>
                {displayDone} из {practiceTarget}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={displayDone} aria-valuemin={0} aria-valuemax={practiceTarget}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Flame className="size-4 shrink-0 text-orange-500" aria-hidden />
              <span>
                Серия: <span className="font-semibold tabular-nums text-foreground">{progress.streak}</span> дней подряд
              </span>
            </div>
          </div>
        :
          <p className="text-sm text-muted-foreground">Загрузка прогресса…</p>
        }
      </div>
    </section>
  );
}
