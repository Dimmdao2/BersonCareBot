import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { AuthBootstrap } from "@/shared/ui/AuthBootstrap";

const COMING_SOON_MESSAGE = "Скоро здесь будет много полезного";

export default async function AppEntryPage() {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();

  if (session) {
    const role = session.user.role;
    redirect(role === "admin" || role === "doctor" ? "/app/doctor" : "/app/patient");
  }

  return (
    <AppShell title="Вход в платформу" user={null}>
      <section className="hero-card stack">
        <p className="empty-state">{COMING_SOON_MESSAGE}</p>
      </section>
      <Suspense fallback={<p className="empty-state">Загрузка...</p>}>
        <AuthBootstrap />
      </Suspense>
    </AppShell>
  );
}
