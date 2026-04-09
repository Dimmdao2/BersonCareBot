import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { listMediaDeleteErrors } from "@/infra/repos/s3MediaStorage";
import { AppShell } from "@/shared/ui/AppShell";
import { PageSection } from "@/components/common/layout/PageSection";

export default async function MediaDeleteErrorsPage() {
  const session = await requireDoctorAccess();
  const { items, total } = await listMediaDeleteErrors(100);

  return (
    <AppShell title="Ошибки удаления в S3" user={session.user} variant="doctor">
      <PageSection id="media-delete-errors-section" as="section" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/app/doctor/content/library" className="text-sm text-primary underline">
            ← Библиотека файлов
          </Link>
          <h2 className="m-0 text-lg font-semibold">Очередь удаления: сбои S3 ({total})</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Файлы в статусе очереди на удаление, где повторные попытки удаления из хранилища не прошли.
          Проверьте доступность MinIO и cron для <code className="rounded bg-muted px-1">POST /api/internal/media-pending-delete/purge</code>.
        </p>
        {items.length === 0 ? (
          <p className="text-sm">Нет записей с ошибками удаления.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2 font-medium">ID</th>
                  <th className="p-2 font-medium">Имя файла</th>
                  <th className="p-2 font-medium">Попытки</th>
                  <th className="p-2 font-medium">След. попытка</th>
                  <th className="p-2 font-medium">Создан</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="p-2 font-mono text-xs">{row.id}</td>
                    <td className="p-2">{row.original_name}</td>
                    <td className="p-2">{row.delete_attempts}</td>
                    <td className="p-2 text-muted-foreground">{row.next_attempt_at ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{row.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </AppShell>
  );
}
