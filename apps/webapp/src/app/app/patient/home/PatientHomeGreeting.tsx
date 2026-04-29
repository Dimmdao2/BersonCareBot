import { cn } from "@/lib/utils";

export type PatientGreetingPrefix =
  | "Доброе утро"
  | "Добрый день"
  | "Добрый вечер"
  | "Доброй ночи";

/** Час суток в IANA-зоне (0–23) для переданного момента времени. */
export function getHourInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  if (!hourPart) return 12;
  let h = parseInt(hourPart.value, 10);
  if (Number.isNaN(h)) return 12;
  if (h === 24) h = 0;
  return h;
}

/** Префикс приветствия по часу в TZ приложения (см. `03_HOME_PRIMARY_PLAN.md`). */
export function greetingPrefixFromHour(hour: number): PatientGreetingPrefix {
  if (hour >= 5 && hour <= 11) return "Доброе утро";
  if (hour >= 12 && hour <= 17) return "Добрый день";
  if (hour >= 18 && hour <= 22) return "Добрый вечер";
  return "Доброй ночи";
}

type PatientHomeGreetingProps = {
  /** Вычислено на сервере в {@link PatientHomeToday}; без `new Date()` на клиенте. */
  timeOfDayPrefix: PatientGreetingPrefix;
  /** Имя только при `personalTierOk`; иначе заголовок без имени. */
  displayName: string | null;
  personalTierOk: boolean;
  subtitle: string;
};

/**
 * Приветствие на главной пациента.
 * Время суток приходит пропсом с сервера — не используйте здесь `new Date()` для часа.
 */
export function PatientHomeGreeting({ timeOfDayPrefix, displayName, personalTierOk, subtitle }: PatientHomeGreetingProps) {
  const showName = personalTierOk && displayName && displayName.trim().length > 0;
  const title = showName ? `${timeOfDayPrefix}, ${displayName.trim()}!` : `${timeOfDayPrefix}!`;

  const initials = showName
    ? displayName
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  return (
    <header id="patient-home-greeting" className="flex items-start gap-3">
      {showName ? (
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
        <p className="mt-1 text-sm leading-5 text-[var(--patient-text-secondary)] lg:text-[15px] lg:leading-6">{subtitle}</p>
      </div>
    </header>
  );
}
