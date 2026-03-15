import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function EmergencyPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const topics = deps.emergency.listEmergencyTopics();

  return (
    <AppShell title="Скорая помощь" user={session.user} backHref="/app/patient" backLabel="Меню">
      <ul className="list">
        {topics.map((topic) => (
          <li key={topic.id} className="list-item">
            <strong>{topic.title}</strong>
            <p>{topic.summary}</p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
