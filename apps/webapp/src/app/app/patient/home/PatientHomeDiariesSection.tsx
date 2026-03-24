import { FeatureCard } from "@/shared/ui/FeatureCard";
import type { MenuItem } from "@/modules/menu/service";

type Props = {
  lfkItem: MenuItem | undefined;
};

/** Дневник ЛФК (отдельно от блока «Кабинет»; комплексы — внутри раздела по продукту). */
export function PatientHomeDiariesSection({ lfkItem }: Props) {
  if (!lfkItem) return null;
  return (
    <section id="patient-home-diaries-section" className="stack gap-3">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Дневники</h2>
      <div className="feature-grid">
        <FeatureCard
          key={lfkItem.id}
          containerId={`patient-home-feature-card-${lfkItem.id}`}
          title={lfkItem.title}
          href={lfkItem.href}
          status={lfkItem.status}
          compact
        />
      </div>
    </section>
  );
}
