import { FeatureCard } from "@/shared/ui/FeatureCard";
import type { MenuItem } from "@/modules/menu/service";

const CABINET_IDS = new Set(["symptoms", "cabinet"]);

type Props = {
  items: MenuItem[];
};

/** Секция «Кабинет»: дневник симптомов и мои записи (комплексы ЛФК на главной не показываем). */
export function PatientHomeCabinetSection({ items }: Props) {
  const cards = items.filter((i) => CABINET_IDS.has(i.id));
  if (cards.length === 0) return null;
  return (
    <section id="patient-home-cabinet-section" className="stack gap-3">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Кабинет</h2>
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
    </section>
  );
}
