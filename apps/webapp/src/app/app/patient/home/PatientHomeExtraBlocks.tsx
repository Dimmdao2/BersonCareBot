import { routePaths } from "@/app-layer/routes/paths";
import { type HomeBlockId } from "@/app-layer/routes/navigation";
import { FeatureCard } from "@/shared/ui/FeatureCard";

const EXTRA_BLOCK_META: Partial<Record<HomeBlockId, { title: string; href: string }>> = {
  purchases: { title: "Мои покупки", href: routePaths.purchases },
};

/**
 * Карточки блоков главной, не покрытые hero / уроками / новостями.
 * «purchases» не входит в canonical-список и добавляется в blocks условно из page.tsx
 * (только для пользователей с покупками).
 */
export function PatientHomeExtraBlocks({ blocks }: { blocks: Set<HomeBlockId> }) {
  const items = [...blocks].flatMap((id) => {
    const meta = EXTRA_BLOCK_META[id];
    return meta ? [{ id, ...meta }] : [];
  });
  if (items.length === 0) return null;
  return (
    <section id="patient-home-extra-blocks" className="flex flex-col gap-3">
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
