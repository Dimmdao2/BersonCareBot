import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeBlocksCanonical,
  type HomeBlockId,
} from "@/app-layer/routes/navigation";
import { FeatureCard } from "@/shared/ui/FeatureCard";

const EXTRA_BLOCK_META: Partial<Record<HomeBlockId, { title: string; href: string }>> = {
  purchases: { title: "Мои покупки", href: routePaths.purchases },
  "lfk-complexes": { title: "Комплексы ЛФК", href: routePaths.lfk },
  "patient-card": { title: "Мой профиль", href: routePaths.profile },
};

/**
 * Карточки разделов из `patientHomeBlocksCanonical`, не покрытые hero / уроками / новостями.
 * Порядок совпадает с каноническим списком блоков.
 */
export function PatientHomeExtraBlocks({ blocks }: { blocks: Set<HomeBlockId> }) {
  const items = patientHomeBlocksCanonical.flatMap((id) => {
    if (!blocks.has(id)) return [];
    const meta = EXTRA_BLOCK_META[id];
    return meta ? [{ id, ...meta }] : [];
  });
  if (items.length === 0) return null;
  return (
    <section id="patient-home-extra-blocks" className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">Разделы</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <FeatureCard
            key={item.id}
            containerId={`patient-home-feature-card-${item.id}`}
            title={item.title}
            href={item.href}
            status="available"
            compact
          />
        ))}
      </div>
    </section>
  );
}
