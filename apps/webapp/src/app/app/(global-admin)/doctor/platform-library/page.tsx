import { enterWithDbInfraPrincipal } from "@bersoncare/db-principal";
import { requirePlatformOperationsPage } from "@/app-layer/guards/requireRole";
import { createPgPlatformLfkLibraryPort } from "@/infra/repos/pgPlatformLfkLibrary";
import { createPlatformLfkLibraryService } from "@/modules/platform-lfk-library/service";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import {
  savePlatformExerciseAction,
  savePlatformTemplateAction,
  setPlatformExerciseArchivedAction,
  setPlatformTemplateArchivedAction,
} from "./actions";

export default async function PlatformLfkLibraryPage() {
  const session = await requirePlatformOperationsPage();
  enterWithDbInfraPrincipal({ source: "platform-lfk-library:page" });
  const snapshot = await createPlatformLfkLibraryService(createPgPlatformLfkLibraryPort()).getSnapshot();
  const activeExercises = snapshot.exercises.filter((exercise) => !exercise.isArchived);

  return (
    <DoctorAppShell title="Базовая библиотека ЛФК" user={session.user}>
      <DoctorPageHeader title="Базовая библиотека ЛФК" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Эти упражнения и комплексы принадлежат платформе. Клиники с включённой механикой видят их рядом со своей
        библиотекой, но не могут изменять. Магазин и копии материалов здесь не создаются.
      </p>

      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <section className="min-w-0 space-y-3">
          <h2 className="text-lg font-semibold">Упражнения</h2>
          <form action={savePlatformExerciseAction} className="space-y-3 rounded-xl border p-4">
            <p className="text-sm font-medium">Новое упражнение</p>
            <Input name="title" required placeholder="Название" />
            <Textarea name="description" placeholder="Описание" />
            <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
              <Input name="mediaUrl" placeholder="Ссылка на изображение или видео" />
              <select name="mediaType" className="h-9 rounded-md border bg-background px-3 text-sm">
                <option value="image">Изображение</option>
                <option value="video">Видео</option>
                <option value="gif">GIF</option>
              </select>
            </div>
            <Button type="submit">Создать</Button>
          </form>
          {snapshot.exercises.map((exercise) => (
            <article key={exercise.id} className="space-y-3 rounded-xl border p-4">
              <form action={savePlatformExerciseAction} className="space-y-3">
                <input type="hidden" name="id" value={exercise.id} />
                <Input name="title" required defaultValue={exercise.title} />
                <Textarea name="description" defaultValue={exercise.description ?? ""} />
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <Input name="mediaUrl" defaultValue={exercise.media[0]?.url ?? ""} placeholder="Ссылка на медиа" />
                  <select
                    name="mediaType"
                    defaultValue={exercise.media[0]?.media_type ?? "image"}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="image">Изображение</option>
                    <option value="video">Видео</option>
                    <option value="gif">GIF</option>
                  </select>
                </div>
                <Button type="submit" variant="secondary">Сохранить</Button>
              </form>
              <form action={setPlatformExerciseArchivedAction}>
                <input type="hidden" name="id" value={exercise.id} />
                <input type="hidden" name="archived" value={exercise.isArchived ? "0" : "1"} />
                <Button type="submit" variant="outline">
                  {exercise.isArchived ? "Вернуть из архива" : "Архивировать"}
                </Button>
              </form>
            </article>
          ))}
        </section>

        <section className="min-w-0 space-y-3">
          <h2 className="text-lg font-semibold">Комплексы</h2>
          {[{ id: "", title: "", description: "", exerciseIds: [] as string[], status: "published" as const }, ...snapshot.templates].map((template) => (
            <article key={template.id || "new"} className="space-y-3 rounded-xl border p-4">
              <form action={savePlatformTemplateAction} className="space-y-3">
                {template.id ? <input type="hidden" name="id" value={template.id} /> : null}
                <p className="text-sm font-medium">{template.id ? "Комплекс" : "Новый комплекс"}</p>
                <Input name="title" required defaultValue={template.title} placeholder="Название" />
                <Textarea name="description" defaultValue={template.description ?? ""} placeholder="Описание" />
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Упражнения</legend>
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                    {activeExercises.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Сначала создайте упражнение.</p>
                    ) : activeExercises.map((exercise) => (
                      <label key={exercise.id} className="flex items-start gap-2 rounded p-1 text-sm hover:bg-muted/50">
                        <input
                          type="checkbox"
                          name="exerciseIds"
                          value={exercise.id}
                          defaultChecked={template.exerciseIds.includes(exercise.id)}
                          className="mt-0.5"
                        />
                        <span>{exercise.title}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit">{template.id ? "Сохранить" : "Создать"}</Button>
              </form>
              {template.id ? (
                <form action={setPlatformTemplateArchivedAction}>
                  <input type="hidden" name="id" value={template.id} />
                  <input type="hidden" name="archived" value={template.status === "archived" ? "0" : "1"} />
                  <Button type="submit" variant="outline">
                    {template.status === "archived" ? "Вернуть из архива" : "Архивировать"}
                  </Button>
                </form>
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </DoctorAppShell>
  );
}
