/**
 * `/app/admin/account-merge?targetId=&duplicateId=` — объединение пары учётных записей.
 *
 * Страница намеренно бесполезна без пары в адресе: попасть сюда можно только из строки журнала
 * конфликтов, которая уже назвала обоих. Решение владельца 13.09: «мерж учёток — из журнала
 * конфликтов». Пункта в меню у экрана нет и не должно быть — см.
 * `docs/_TODO/ACCOUNT_MERGE_TO_PLATFORM_CONSOLE_2026-09-13.md`.
 */
import Link from 'next/link';
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { AccountMergeClient } from './AccountMergeClient';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AccountMergePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformOperationsPage();
  const params = await searchParams;
  const read = (key: string): string | null => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && UUID_RE.test(value.trim()) ? value.trim() : null;
  };
  const targetId = read('targetId');
  const duplicateId = read('duplicateId');
  const pairIsUsable = targetId != null && duplicateId != null && targetId !== duplicateId;

  return (
    <DoctorAppShell title="Объединение учётных записей" user={session.user}>
      <DoctorPageHeader title="Объединение учётных записей" />
      {pairIsUsable ? (
        <AccountMergeClient targetId={targetId} duplicateId={duplicateId} />
      ) : (
        <section className="rounded-xl border border-border bg-card p-6 text-sm">
          <p className="mb-2">Экран открывается для конкретной пары карточек.</p>
          <p className="text-muted-foreground">
            Найдите нужный случай в{' '}
            <Link href="/app/admin/audit-log" className="text-primary underline-offset-2 hover:underline">
              журнале операций
            </Link>{' '}
            и откройте объединение оттуда — так видно, из-за чего пара попала на разбор.
          </p>
        </section>
      )}
    </DoctorAppShell>
  );
}
