import type { ContentSectionRow } from "@/infra/repos/pgContentSections";
import { routePaths } from "@/app-layer/routes/paths";
import type { SessionUser } from "@/shared/types/session";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { PatientHomeBookingCard } from "@/app/app/patient/home/PatientHomeBookingCard";
import { PatientHomeDailyWarmupCard } from "@/app/app/patient/home/PatientHomeDailyWarmupCard";
import { PatientHomeGreeting, getHourInTimeZone, greetingPrefixFromHour } from "@/app/app/patient/home/PatientHomeGreeting";
import { PatientHomeSituationsRow } from "@/app/app/patient/home/PatientHomeSituationsRow";
import { PatientHomeTodayLayout } from "@/app/app/patient/home/PatientHomeTodayLayout";

export type PatientHomeTodayProps = {
  personalTierOk: boolean;
  sessionUser: SessionUser | null;
  contentSections: ContentSectionRow[];
  showBooking: boolean;
  showMaterials: boolean;
  /**
   * CMS `patient_home_*`: если задано — «Ситуации» из блока (порядок из БД).
   * `undefined` — прежняя логика (второй+ разделы из общего списка).
   */
  cmsSituationSections?: ContentSectionRow[];
  /**
   * CMS: карточка «Разминка дня» из `daily_warmup` (первая опубликованная страница в блоке).
   * `undefined` — прежняя логика (первый раздел каталога).
   */
  cmsDailyWarmup?: {
    title: string;
    summary: string;
    href: string;
    imageUrl?: string | null;
    durationMinutes?: number | null;
  } | null;
};

/** Сортировка разделов как для primary-зоны (sort_order, затем title). */
export function sortPatientContentSectionsForHome(sections: ContentSectionRow[]): ContentSectionRow[] {
  return [...sections].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, "ru");
  });
}

function warmupTargetHref(slug: string): string {
  const path = `/app/patient/sections/${encodeURIComponent(slug)}`;
  return `${path}?from=daily_warmup`;
}

const GREETING_SUBTITLE = "Готовы к разминке?";

/**
 * Primary-зона «Сегодня»: приветствие (TZ с сервера), hero, запись, быстрые разделы.
 * Разделы — `content_sections`; при переданных `cms*` — источник главной из `patient_home_*`.
 */
export async function PatientHomeToday({
  personalTierOk,
  sessionUser,
  contentSections,
  showBooking,
  showMaterials,
  cmsSituationSections,
  cmsDailyWarmup,
}: PatientHomeTodayProps) {
  const sorted = sortPatientContentSectionsForHome(contentSections);
  const appTz = await getAppDisplayTimeZone();
  const now = new Date();
  const hour = getHourInTimeZone(now, appTz);
  const prefix = greetingPrefixFromHour(hour);
  const displayName = sessionUser?.displayName ?? null;

  const useCmsSituations = cmsSituationSections !== undefined;
  const situationSections = useCmsSituations
    ? cmsSituationSections
    : showMaterials && sorted.length > 1
      ? sorted.slice(1)
      : [];

  const heroSection = !cmsDailyWarmup && showMaterials && sorted.length > 0 ? sorted[0] : null;

  const hero =
    cmsDailyWarmup !== undefined ? (
      cmsDailyWarmup ? (
        <PatientHomeDailyWarmupCard
          title={cmsDailyWarmup.title}
          summary={cmsDailyWarmup.summary}
          href={cmsDailyWarmup.href}
          imageUrl={cmsDailyWarmup.imageUrl ?? null}
          durationMinutes={cmsDailyWarmup.durationMinutes ?? null}
        />
      ) : showMaterials ? (
        <PatientHomeDailyWarmupCard
          title="Разминка дня"
          summary="Скоро здесь появятся персональные материалы. А пока загляните в каталог разделов."
          href={routePaths.patientSectionsIndex}
          imageUrl={null}
          durationMinutes={null}
        />
      ) : null
    ) : heroSection != null ? (
      <PatientHomeDailyWarmupCard
        title={heroSection.title}
        summary={heroSection.description || "Короткая разминка перед нагрузкой — мягкий старт для суставов и дыхания."}
        href={warmupTargetHref(heroSection.slug)}
        imageUrl={heroSection.iconImageUrl ?? heroSection.coverImageUrl ?? null}
        durationMinutes={null}
      />
    ) : showMaterials ? (
      <PatientHomeDailyWarmupCard
        title="Разминка дня"
        summary="Скоро здесь появятся персональные материалы. А пока загляните в каталог разделов."
        href={routePaths.patientSectionsIndex}
        imageUrl={null}
        durationMinutes={null}
      />
    ) : null;

  const booking = showBooking ? (
    <PatientHomeBookingCard
      bookingHref={routePaths.patientBooking}
      cabinetHref={routePaths.cabinet}
      guestMode={sessionUser == null}
    />
  ) : null;

  const situations = situationSections.length > 0 ? <PatientHomeSituationsRow sections={situationSections} /> : null;

  return (
    <PatientHomeTodayLayout
      greeting={
        <PatientHomeGreeting
          timeOfDayPrefix={prefix}
          displayName={displayName}
          personalTierOk={personalTierOk}
          subtitle={GREETING_SUBTITLE}
        />
      }
      hero={hero}
      booking={booking}
      situations={situations}
    />
  );
}
