import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function PatientLessonsPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const lessons = deps.lessons.listLessons();

  return (
    <AppShell title="Полезные уроки" user={session.user} backHref="/app/patient" backLabel="Меню">
      <ul className="list">
        {lessons.map((lesson) => (
          <li key={lesson.id} className="list-item">
            <strong>{lesson.title}</strong>
            <p>{lesson.summary}</p>
            <span className={`status-pill status-pill--${lesson.status}`}>{lesson.type}</span>
            <Link href={`/app/patient/content/${lesson.id}`} className="button button--ghost">
              Открыть
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
