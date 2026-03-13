import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

export default async function PatientHomePage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const menu = deps.menu.getMenuForRole(session.user.role);

  return (
    <AppShell title="Интерфейс клиента" user={session.user}>
      <section className="hero-card stack">
        <p>
          Это основной shell пациентской зоны. Навигация и модули уже разделены по role-based route space,
          но часть разделов пока остается заглушкой по MVP-плану.
        </p>
      </section>
      <section className="feature-grid">
        {menu.map((item) => (
          <FeatureCard
            key={item.id}
            title={item.title}
            description={`Раздел ${item.title.toLowerCase()} внутри общего webapp.`}
            href={item.href}
            status={item.status}
          />
        ))}
      </section>
    </AppShell>
  );
}
