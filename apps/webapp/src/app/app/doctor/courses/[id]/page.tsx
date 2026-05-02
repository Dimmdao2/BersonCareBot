import { notFound } from "next/navigation";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { COURSE_LESSON_SECTIONS } from "@/modules/courses/types";
import { AppShell } from "@/shared/ui/AppShell";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import { DoctorCourseEditForm } from "./DoctorCourseEditForm";

type PageProps = { params: Promise<{ id: string }> };

function isLessonSection(section: string): boolean {
  return (COURSE_LESSON_SECTIONS as readonly string[]).includes(section);
}

export default async function DoctorCourseEditPage(props: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  const deps = buildAppDeps();
  let course = await deps.courses.getCourseForDoctor(id);
  if (!course) {
    notFound();
  }

  let templates: { id: string; title: string; status: string }[] = [];
  let introPageOptions: { id: string; title: string }[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;

  try {
    const rows = await deps.treatmentProgram.listTemplates({});
    templates = rows.map((r) => ({ id: r.id, title: r.title, status: r.status }));
    const templateIds = new Set(templates.map((t) => t.id));
    if (!templateIds.has(course.programTemplateId)) {
      try {
        const d = await deps.treatmentProgram.getTemplate(course.programTemplateId);
        templates = [{ id: d.id, title: d.title, status: d.status }, ...templates];
      } catch {
        templates = [
          { id: course.programTemplateId, title: "Текущий шаблон (не найден в списке)", status: "?" },
          ...templates,
        ];
      }
    }

    const allPages = await deps.contentPages.listAll();
    const opts = allPages
      .filter((p) => !p.deletedAt && isLessonSection(p.section))
      .map((p) => ({ id: p.id, title: p.title }));
    const byId = new Map(opts.map((o) => [o.id, o]));
    if (course.introLessonPageId && !byId.has(course.introLessonPageId)) {
      const extra = await deps.contentPages.getById(course.introLessonPageId);
      if (extra) {
        opts.push({ id: extra.id, title: `${extra.title} (текущая)` });
      }
    }
    introPageOptions = opts.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/courses/[id]", err, { courseId: id });
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <AppShell title={course.title} user={session.user} variant="doctor" backHref="/app/doctor/courses">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="font-mono text-xs text-muted-foreground">{course.id}</p>
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет шаблонов программ лечения — сначала создайте шаблон, затем вернитесь к редактированию курса.
          </p>
        ) : (
          <DoctorCourseEditForm
            courseId={course.id}
            initial={course}
            templates={templates}
            introPageOptions={introPageOptions}
          />
        )}
      </section>
    </AppShell>
  );
}
