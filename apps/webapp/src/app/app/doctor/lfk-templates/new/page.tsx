import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLfkTemplateDraft } from "../actions";

export default async function DoctorLfkTemplateNewPage() {
  const session = await requireDoctorAccess();

  return (
    <AppShell
      title="Новый комплекс"
      user={session.user}
      variant="doctor"
      backHref="/app/doctor/lfk-templates"
    >
      <section className="flex max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Задайте название черновика. После создания вы попадёте в конструктор, где можно добавить упражнения и
          опубликовать комплекс.
        </p>
        <form action={createLfkTemplateDraft} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-new-title">Название</Label>
            <Input id="tpl-new-title" name="title" placeholder="Новый комплекс" />
          </div>
          <Button type="submit">Создать и открыть</Button>
        </form>
      </section>
    </AppShell>
  );
}
