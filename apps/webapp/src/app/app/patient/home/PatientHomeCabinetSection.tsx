import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { FeatureCard } from "@/shared/ui/FeatureCard";
import type { MenuItem } from "@/modules/menu/service";

/** Порядок карточек: Дневник → Мои записи (RAW §7). Пункт «Мои комплексы ЛФК» на главной скрыт. */
const CABINET_ORDER = ["diary", "cabinet"] as const;

type Props = {
  items: MenuItem[];
};

/** Секция «Кабинет»: Дневник (`/app/patient/diary`) и Мои записи. */
export function PatientHomeCabinetSection({ items }: Props) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const cards = CABINET_ORDER.map((id) => byId.get(id)).filter((x): x is MenuItem => x != null);
  if (cards.length === 0) return null;
  return (
    <section id="patient-home-cabinet-section" className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">Кабинет</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((item) => (
          <FeatureCard
            key={item.id}
            containerId={`patient-home-feature-card-${item.id}`}
            title={item.title}
            href={item.href}
            status={item.status}
            compact
          />
        ))}
      </div>
      <Link
        href={routePaths.patientBooking}
        className={cn(
          buttonVariants({ variant: "default", size: "default" }),
          "inline-flex min-h-11 w-full justify-center rounded-lg text-center font-semibold text-primary-foreground shadow-sm hover:text-primary-foreground active:text-primary-foreground"
        )}
      >
        Записаться на приём
      </Link>
    </section>
  );
}
