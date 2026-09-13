/**
 * `/app/admin/login-history?userId=…` или `?ip=…` — история входов (#1112).
 *
 * Экран отвечает на конкретный вопрос и намеренно бесполезен без него: «все входы всех людей» —
 * это та самая постоянная слежка за всеми карточками, от которой канон Р-АДМИН отказывается.
 * Расследование идёт цепочкой: учётная запись → её входы → подозрительный адрес → кто ещё входил
 * с этого адреса. Поэтому вход сюда — из карточки учётной записи и из журнала, а не пунктом меню.
 *
 * План: `docs/_TODO/LOGIN_HISTORY_2026-09-13.md`, этап Л-5.
 */
import Link from 'next/link';
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { LoginHistoryClient } from './LoginHistoryClient';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** IPv4 и IPv6 в общем виде: точная проверка всё равно у базы, здесь — отсев мусора из адреса. */
const IP_RE = /^[0-9a-f.:]{3,45}$/i;

export default async function LoginHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformOperationsPage();
  const params = await searchParams;
  const read = (key: string, re: RegExp): string | null => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && re.test(value.trim()) ? value.trim() : null;
  };
  const userId = read('userId', UUID_RE);
  const ip = read('ip', IP_RE);
  const askable = (userId != null) !== (ip != null);

  return (
    <DoctorAppShell title="Входы в учётную запись" user={session.user}>
      <DoctorPageHeader title="Входы в учётную запись" />
      {askable ? (
        <LoginHistoryClient userId={userId} ip={ip} />
      ) : (
        <section className="rounded-xl border border-border bg-card p-6 text-sm">
          <p className="mb-2">
            Экран открывается либо для одной учётной записи, либо для одного адреса.
          </p>
          <p className="text-muted-foreground">
            Начните с{' '}
            <Link
              href="/app/admin/audit-log"
              className="text-primary underline-offset-2 hover:underline"
            >
              журнала операций
            </Link>{' '}
            — оттуда видно, чью учётную запись разбираете, а дальше по адресу входа можно
            посмотреть, кто ещё заходил с того же места.
          </p>
        </section>
      )}
    </DoctorAppShell>
  );
}
