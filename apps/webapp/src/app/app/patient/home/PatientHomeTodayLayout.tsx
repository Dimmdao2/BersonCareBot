import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PatientHomeTodayLayoutProps = {
  greeting: ReactNode;
  hero: ReactNode | null;
  booking: ReactNode | null;
  situations: ReactNode | null;
};

/**
 * Оркестратор primary-зоны главной: одна колонка на mobile, dashboard grid на desktop.
 * Пустые слоты не создают «дыры»: правая колонка только при `situations`.
 */
export function PatientHomeTodayLayout({ greeting, hero, booking, situations }: PatientHomeTodayLayoutProps) {
  const hasSituations = situations != null;
  return (
    <section
      id="patient-home-today-layout"
      className={cn(
        "flex flex-col gap-4",
        hasSituations && "lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6",
      )}
    >
      <div className="flex min-w-0 flex-col gap-4">
        {greeting}
        {hero}
        {booking}
      </div>
      {hasSituations ? <aside className="min-w-0">{situations}</aside> : null}
    </section>
  );
}
