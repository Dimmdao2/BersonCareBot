import { cn } from "@/lib/utils";

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
  subtitle?: string;
};

export function PatientHomeGreeting({
  personalizedName,
  timeOfDayPrefix,
  subtitle = "Забота о себе — это сила",
}: Props) {
  const displayName = personalizedName?.trim() || null;
  const title =
    timeOfDayPrefix ?
      displayName ? `${timeOfDayPrefix}, ${displayName}!` : `${timeOfDayPrefix}!`
    : displayName ? `Здравствуйте, ${displayName}`
    : "Здравствуйте";
  const initials =
    displayName ?
      displayName
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  return (
    <header id="patient-home-greeting" className="flex items-start gap-3 px-0 pt-1">
      {displayName ? (
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold",
            "bg-[var(--patient-color-primary-soft)] text-[#3730a3]",
          )}
          aria-hidden
        >
          {initials}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-bold leading-6 tracking-tight text-[var(--patient-text-primary)] lg:text-xl lg:leading-7">
          {title}
        </h1>
        <p className="mt-1 text-sm leading-5 text-[var(--patient-text-secondary)] lg:text-[15px] lg:leading-6">
          {subtitle}
        </p>
      </div>
    </header>
  );
}
