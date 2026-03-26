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
    <section id="patient-home-cabinet-section" className="stack gap-3">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">Кабинет</h2>
      <div className="feature-grid">
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
          buttonVariants({ size: "lg" }),
          "inline-flex w-full justify-center text-center font-semibold shadow-sm"
        )}
      >
        Записаться на приём
      </Link>
    </section>
  );
}
