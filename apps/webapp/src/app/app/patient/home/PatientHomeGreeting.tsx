import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { patientInlineLinkClass } from "@/shared/ui/patient/patientVisual";

/** Тот же вид, что у приветствия на главной (не стиль заголовка шапки). */
export const PATIENT_HOME_GREETING_TITLE_CLASS =
  "m-0 text-sm font-normal leading-snug tracking-tight text-[var(--patient-text-secondary)] md:text-base md:leading-snug";

export type PatientGreetingPrefix =
  | "Доброе утро"
  | "Добрый день"
  | "Добрый вечер"
  | "Доброй ночи";

export function greetingPrefixFromHour(hour: number): PatientGreetingPrefix {
  if (hour >= 5 && hour <= 11) return "Доброе утро";
  if (hour >= 12 && hour <= 17) return "Добрый день";
  if (hour >= 18 && hour <= 22) return "Добрый вечер";
  return "Доброй ночи";
}

export function buildPatientGreetingTitle(
  personalizedName: string | null,
  timeOfDayPrefix?: PatientGreetingPrefix,
): string {
  const displayName = personalizedName?.trim() || null;
  if (timeOfDayPrefix) {
    return displayName ? `${timeOfDayPrefix}, ${displayName}!` : `${timeOfDayPrefix}!`;
  }
  return displayName ? `Здравствуйте, ${displayName}` : "Здравствуйте";
}

/** Приветствие в mobile-шапке главной (те же стили, что в контенте). */
export function PatientHomeGreetingMobileHeader({
  personalizedName,
  timeOfDayPrefix,
}: {
  personalizedName: string | null;
  timeOfDayPrefix?: PatientGreetingPrefix;
}) {
  return (
    <h1 className={cn(PATIENT_HOME_GREETING_TITLE_CLASS, "min-w-0 flex-1 truncate text-left")}>
      {buildPatientGreetingTitle(personalizedName, timeOfDayPrefix)}
    </h1>
  );
}

type Props = {
  /** Имя для обращения (`first_name`, иначе `display_name`); только при полном tier patient. */
  personalizedName: string | null;
  /** §10.1: вычисляется сервером в timezone приложения; fallback сохраняет старый заголовок. */
  timeOfDayPrefix?: PatientGreetingPrefix;
  /** Непрочитанные входящие от врача/поддержки в webapp-чате. */
  unreadChatCount?: number;
};

export function PatientHomeGreeting({ personalizedName, timeOfDayPrefix, unreadChatCount = 0 }: Props) {
  const title = buildPatientGreetingTitle(personalizedName, timeOfDayPrefix);
  const showUnreadHint = unreadChatCount > 0;

  return (
    <header
      id="patient-home-greeting"
      className={cn(
        "pt-0 patient-desktop:pl-2 patient-desktop:pr-0",
        !showUnreadHint && "hidden patient-desktop:block",
      )}
    >
      <h1 className={cn(PATIENT_HOME_GREETING_TITLE_CLASS, "hidden patient-desktop:block")}>{title}</h1>
      {showUnreadHint ? (
        <p className="m-0 mt-1 text-sm leading-snug text-[var(--patient-text-secondary)]">
          У вас есть новое сообщение{" "}
          <Link href={routePaths.patientMessages} className={patientInlineLinkClass}>
            в чате
          </Link>
        </p>
      ) : null}
    </header>
  );
}
