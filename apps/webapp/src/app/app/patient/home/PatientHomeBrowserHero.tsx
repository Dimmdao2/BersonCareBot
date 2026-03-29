import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";

/**
 * Верхняя зона главной: кабинет, дневник, личный помощник.
 * Запись на приём — пункт меню (гамбургер / сетка).
 */
export function PatientHomeBrowserHero() {
  const cardClass = cn(
    "rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow",
    "block hover:border-primary/30 hover:shadow-md active:scale-[0.98] md:hover:-translate-y-px",
  );

  return (
    <section id="patient-home-browser-hero" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={routePaths.cabinet}
          id="patient-home-browser-link-cabinet"
          className={cardClass}
        >
          <h2 className="text-base font-semibold">Кабинет</h2>
          <p className="mt-2 text-sm text-muted-foreground">Запись, история, карта клиента</p>
        </Link>
        <Link
          href={routePaths.diary}
          id="patient-home-browser-link-diary"
          className={cardClass}
        >
          <h2 className="text-base font-semibold">Дневник</h2>
          <p className="mt-2 text-sm text-muted-foreground">Управление дневниками</p>
        </Link>
      </div>
      <Link
        href={routePaths.patientReminders}
        id="patient-home-browser-link-assistant"
        className={cardClass}
      >
        <h2 className="text-base font-semibold">Личный помощник</h2>
        <p className="mt-2 text-sm text-muted-foreground">Напоминания и уведомления</p>
      </Link>
    </section>
  );
}
