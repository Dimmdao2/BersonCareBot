import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { cn } from "@/lib/utils";

const LOAD_LABEL: Record<ExerciseLoadType, string> = {
  strength: "Силовая",
  stretch: "Растяжка",
  balance: "Баланс",
  cardio: "Кардио",
  other: "Другое",
};

type PageProps = {
  searchParams?: Promise<{ q?: string; region?: string; load?: string }>;
};

export default async function DoctorExercisesPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionRefId = typeof sp.region === "string" && sp.region.trim() ? sp.region.trim() : undefined;
  const loadType =
    sp.load === "strength" ||
    sp.load === "stretch" ||
    sp.load === "balance" ||
    sp.load === "cardio" ||
    sp.load === "other"
      ? sp.load
      : undefined;

  const deps = buildAppDeps();
  const list = await deps.lfkExercises.listExercises({
    search: q || null,
    regionRefId: regionRefId ?? null,
    loadType: loadType ?? null,
    includeArchived: false,
  });

  return (
    <AppShell title="Упражнения ЛФК" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="ex-q">
                Поиск по названию
              </label>
              <Input id="ex-q" name="q" defaultValue={q} placeholder="Название" className="w-56" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="ex-region">
                ID области (справочник)
              </label>
              <Input
                id="ex-region"
                name="region"
                defaultValue={regionRefId ?? ""}
                placeholder="uuid области тела"
                className="w-64 font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="ex-load">
                Тип нагрузки
              </label>
              <select
                id="ex-load"
                name="load"
                className="h-9 w-auto min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={loadType ?? ""}
              >
                <option value="">Все</option>
                <option value="strength">Силовая</option>
                <option value="stretch">Растяжка</option>
                <option value="balance">Баланс</option>
                <option value="cardio">Кардио</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <Button type="submit" variant="secondary">
              Применить
            </Button>
          </form>
          <Link
            href="/app/doctor/exercises/new"
            className={cn(buttonVariants(), "ml-auto")}
            id="doctor-exercises-create-link"
          >
            Создать упражнение
          </Link>
        </div>

        {list.length === 0 ? (
          <p className="text-muted-foreground">Нет упражнений по заданным фильтрам.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((ex) => (
              <li key={ex.id}>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="text-base leading-snug">
                      <Link
                        href={`/app/doctor/exercises/${ex.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {ex.title}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 text-sm">
                    <div className="flex flex-wrap gap-1">
                      {ex.loadType ? (
                        <Badge variant="secondary">{LOAD_LABEL[ex.loadType]}</Badge>
                      ) : null}
                      {ex.difficulty1_10 != null ? (
                        <Badge variant="outline">Сложность {ex.difficulty1_10}/10</Badge>
                      ) : null}
                    </div>
                    {ex.media[0]?.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ex.media[0].mediaUrl}
                        alt=""
                        className="max-h-32 w-full rounded-md object-cover"
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
