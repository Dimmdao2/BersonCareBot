import Link from "next/link";
import type { ResolvedPatientHomeBlockItem } from "@/modules/patient-home/todayConfig";
import { patientHomeCardClass } from "./patientHomeCardStyles";
import { appLoginWithNextHref, stripApiMediaForAnonymousGuest } from "./patientHomeGuestNav";

type Props = {
  warmup: ResolvedPatientHomeBlockItem | null;
  personalTierOk: boolean;
  anonymousGuest: boolean;
};

export function PatientHomeDailyWarmupCard({ warmup, personalTierOk, anonymousGuest }: Props) {
  const page = warmup?.page;

  if (!page) {
    return (
      <section aria-labelledby="patient-home-warmup-heading">
        <h2 id="patient-home-warmup-heading" className="mb-2 text-base font-semibold">
          Разминка дня
        </h2>
        <div className={patientHomeCardClass}>
          <p className="text-sm text-muted-foreground">Скоро здесь появится разминка дня.</p>
        </div>
      </section>
    );
  }

  const heroImageUrl = stripApiMediaForAnonymousGuest(page.imageUrl, anonymousGuest);
  const warmupHref = `/app/patient/content/${encodeURIComponent(page.slug)}?from=daily_warmup`;
  const warmupLinkHref = anonymousGuest ? appLoginWithNextHref(warmupHref) : warmupHref;

  return (
    <section aria-labelledby="patient-home-warmup-heading">
      <h2 id="patient-home-warmup-heading" className="mb-2 text-base font-semibold">
        Разминка дня
      </h2>
      <div className={`${patientHomeCardClass} overflow-hidden p-0`}>
        {heroImageUrl ?
          <div className="aspect-[4/3] w-full bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- CMS URL */}
            <img src={heroImageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        : null}
        <div className="p-4">
          <h3 className="text-lg font-semibold leading-snug">{page.title}</h3>
          {page.summary?.trim() ?
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{page.summary.trim()}</p>
          : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href={warmupLinkHref}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Начать разминку
            </Link>
            {anonymousGuest ?
              <p className="text-xs text-muted-foreground">
                Войдите, чтобы открыть материал и отмечать прогресс выполнения.
              </p>
            : !personalTierOk ?
              <p className="text-xs text-muted-foreground">
                Активируйте профиль пациента, чтобы отмечать прогресс выполнения.
              </p>
            : null}
          </div>
        </div>
      </div>
    </section>
  );
}
