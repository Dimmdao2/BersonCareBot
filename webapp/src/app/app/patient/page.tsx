import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

export default async function PatientHomePage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const menu = deps.menu.getMenuForRole(session.user.role);

  return (
    <AppShell title="Главное меню" user={session.user} titleSmall>
      <section className="feature-grid feature-grid--compact">
        {menu.map((item) => (
          <FeatureCard
            key={item.id}
            title={item.title}
            href={item.href}
            status={item.status}
            compact
          />
        ))}
      </section>
    </AppShell>
  );
}
