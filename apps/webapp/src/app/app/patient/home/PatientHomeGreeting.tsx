import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { patientInlineLinkClass } from "@/shared/ui/patientVisual";

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

type Props = {
  /** Имя только при полном tier patient (без ПДн при onboarding). */
  personalizedName: string | null;
  /** §10.1: вычисляется сервером в timezone приложения; fallback сохраняет старый заголовок. */
  timeOfDayPrefix?: PatientGreetingPrefix;
  /** Непрочитанные входящие от врача/поддержки в webapp-чате. */
  unreadChatCount?: number;
};

export function PatientHomeGreeting({ personalizedName, timeOfDayPrefix, unreadChatCount = 0 }: Props) {
  const displayName = personalizedName?.trim() || null;
  const title =
    timeOfDayPrefix ?
      displayName ? `${timeOfDayPrefix}, ${displayName}!` : `${timeOfDayPrefix}!`
    : displayName ? `Здравствуйте, ${displayName}`
    : "Здравствуйте";

  const showUnreadHint = unreadChatCount > 0;

  return (
    <header id="patient-home-greeting" className="pl-2 pr-0 pt-0">
      <h1
        className={cn(
          "m-0 text-sm font-normal leading-snug tracking-tight text-[var(--patient-text-secondary)]",
          "md:text-base md:leading-snug",
        )}
      >
        {title}
      </h1>
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
