/**
 * Статистика материалов: платформенные метрики и сводка оценок (звёзды) по данным пациентов.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { MaterialContentStatsClient } from "@/app/app/doctor/material-ratings/MaterialContentStatsClient";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";
import type { MaterialRatingTargetKind } from "@/modules/material-rating/types";

const KIND_LABEL: Record<MaterialRatingTargetKind, string> = {
  content_page: "Страница CMS",
  lfk_exercise: "Упражнение",
  lfk_complex: "Комплекс ЛФК (шаблон)",
};

const PAGE_SIZE = 40;

type Props = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function DoctorMaterialRatingsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const sp = await searchParams;
  const rawPage = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const pageNum = Math.max(1, Math.floor(Number(rawPage ?? "1")) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const deps = buildAppDeps();
  const rowsPlus = await deps.materialRating.listDoctorSummary({
    limit: PAGE_SIZE + 1,
    offset,
  });
  const hasNext = rowsPlus.length > PAGE_SIZE;
  const rows = rowsPlus.slice(0, PAGE_SIZE);

  const contentIds = [...new Set(rows.filter((r) => r.targetKind === "content_page").map((r) => r.targetId))];
  const contentMetas = await deps.contentPages.listMetaByIds(contentIds);
  const contentById = new Map(contentMetas.map((m) => [m.id, m]));

  const templateIds = [...new Set(rows.filter((r) => r.targetKind === "lfk_complex").map((r) => r.targetId))];
  const templateTitleById = new Map<string, string | null>();
  await Promise.all(
    templateIds.map(async (id) => {
      const t = await deps.lfkTemplates.getTemplate(id);
      templateTitleById.set(id, t?.title?.trim() ? t.title : null);
    }),
  );

  const exerciseIds = [...new Set(rows.filter((r) => r.targetKind === "lfk_exercise").map((r) => r.targetId))];
  const exerciseTitleById = await deps.lfkExercises.listExerciseTitlesByIds(exerciseIds);

  const grouped: Record<MaterialRatingTargetKind, typeof rows> = {
    content_page: [],
    lfk_exercise: [],
    lfk_complex: [],
  };
  for (const r of rows) {
    grouped[r.targetKind].push(r);
  }

  const basePath = "/app/doctor/material-ratings";

  return (
    <DoctorAppShell title="По контенту" user={session.user} backHref="/app/doctor/content" backLabel="Материалы">
      <div className="flex flex-col gap-6">
        <MaterialContentStatsClient />
        <p className="text-xs text-muted-foreground">
          Оценки · страница {pageNum}
          {hasNext ? " · есть следующие записи" : offset > 0 ? " · конец списка" : null}
        </p>
        {(Object.keys(grouped) as MaterialRatingTargetKind[]).map((kind) => {
          const list = grouped[kind];
          if (list.length === 0) return null;
          return (
            <section key={kind} className={doctorSectionCardClass}>
              <h2 className={`mb-3 ${doctorSectionTitleClass}`}>{KIND_LABEL[kind]}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Материал</th>
                      <th className="py-2 pr-3 font-medium">Средняя</th>
                      <th className="py-2 pr-3 font-medium">Оценок</th>
                      <th className="py-2 pr-3 font-medium">1–5</th>
                      <th className="py-2 font-medium w-[100px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      let label: ReactNode = <span className="text-muted-foreground">Материал</span>;
                      if (kind === "lfk_exercise") {
                        const title = exerciseTitleById.get(r.targetId)?.trim();
                        label = (
                          <Link
                            className="text-primary underline-offset-2 hover:underline"
                            href={`/app/doctor/exercises/${r.targetId}`}
                          >
                            {title || "Упражнение"}
                          </Link>
                        );
                      } else if (kind === "content_page") {
                        const meta = contentById.get(r.targetId);
                        label = (
                          <Link
                            className="text-primary underline-offset-2 hover:underline"
                            href={`/app/doctor/content/edit/${r.targetId}`}
                          >
                            {meta?.title?.trim() ? meta.title : "Страница"}
                          </Link>
                        );
                      } else if (kind === "lfk_complex") {
                        const title = templateTitleById.get(r.targetId);
                        label = (
                          <Link
                            className="text-primary underline-offset-2 hover:underline"
                            href={`/app/doctor/lfk-templates/${r.targetId}`}
                          >
                            {title ?? "Шаблон комплекса"}
                          </Link>
                        );
                      }
                      return (
                        <tr key={`${r.targetKind}-${r.targetId}`} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3 align-top">{label}</td>
                          <td className="py-2 pr-3 tabular-nums">{r.avg != null ? r.avg.toFixed(2) : "—"}</td>
                          <td className="py-2 pr-3 tabular-nums">{r.count}</td>
                          <td className="py-2 text-xs text-muted-foreground tabular-nums">
                            {[1, 2, 3, 4, 5].map((s) => `${s}:${r.distribution[s] ?? 0}`).join(" · ")}
                          </td>
                          <td className="py-2 align-top">
                            <Link
                              className="text-primary text-sm underline-offset-2 hover:underline whitespace-nowrap"
                              href={`/app/doctor/material-ratings/${r.targetKind}/${r.targetId}`}
                            >
                              Подробно
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">На этой странице нет записей.</p> : null}
        <div className="flex flex-wrap gap-4 text-sm">
          {pageNum > 1 ? (
            <Link className="text-primary underline-offset-2 hover:underline" href={pageNum === 2 ? basePath : `${basePath}?page=${pageNum - 1}`}>
              Назад
            </Link>
          ) : null}
          {hasNext ? (
            <Link className="text-primary underline-offset-2 hover:underline" href={`${basePath}?page=${pageNum + 1}`}>
              Далее
            </Link>
          ) : null}
        </div>
      </div>
    </DoctorAppShell>
  );
}
