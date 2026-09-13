/**
 * Список входов по одной учётной записи или по одному адресу (#1112).
 *
 * Адрес в строке — ссылка на этот же экран, но уже по адресу: так разбор идёт цепочкой
 * «учётная запись → её входы → подозрительный адрес → кто ещё входил оттуда», и для этого не нужен
 * ни поиск по людям, ни лента всех входов.
 *
 * Имени человека здесь нет намеренно: у роли платформы нет права читать карточки людей, и экран это
 * не обходит — он показывает идентификатор учётной записи и ссылку на её входы.
 */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { errorCodeText } from '@/shared/notifications/errorCodeText';
import { notificationText } from '@/shared/notifications/notificationText';
import { deviceSummary, loginMethodLabel, loginRoleLabel, outcomeLabel } from './loginHistoryText';

type Row = {
  id: string;
  userId: string;
  occurredAt: string;
  outcome: string;
  failureReason: string | null;
  method: string;
  role: string;
  ip: string | null;
  userAgent: string | null;
  deviceKind: string | null;
  os: string | null;
  browser: string | null;
  host: string | null;
};

type ApiOk = { ok: true; items: Row[]; total: number; page: number; limit: number };

type Props = {
  userId: string | null;
  ip: string | null;
};

const PAGE_SIZE = 50;

function whenText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU');
}

export function LoginHistoryClient({ userId, ip }: Props) {
  const [data, setData] = useState<ApiOk | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setLoadError(null);
    const query = new URLSearchParams();
    if (userId) query.set('userId', userId);
    if (ip) query.set('ip', ip);
    query.set('page', String(page));
    query.set('limit', String(PAGE_SIZE));
    void (async () => {
      try {
        const res = await fetch(`/api/admin/login-history?${query.toString()}`, {
          credentials: 'include',
          signal: ac.signal,
        });
        const body = (await res.json()) as ApiOk | { ok: false; error?: string };
        if (!res.ok || (body as ApiOk).ok !== true) {
          setLoadError(
            errorCodeText((body as { error?: string }).error, notificationText.commonGenericError),
          );
          setData(null);
          return;
        }
        setData(body as ApiOk);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setLoadError(notificationText.commonNoServerConnection);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [userId, ip, page]);

  if (loading) return <DoctorPanelLoading />;

  if (loadError != null || data == null) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 text-sm">
        <p>{loadError ?? notificationText.commonGenericError}</p>
      </section>
    );
  }

  const lastPage = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Что показано
        </h2>
        {userId ? (
          <p>Входы одной учётной записи. Всего записей: {data.total}.</p>
        ) : (
          <p>
            Все, кто входил с адреса {ip}. Всего записей: {data.total}.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Записи хранятся 13 месяцев, дальше удаляются — так требуют правила хранения журналов
          безопасности, и дольше держать адрес и устройство человека нельзя.
        </p>
      </section>

      {data.items.length === 0 ? (
        <section className="rounded-xl border border-border bg-card p-6 text-sm">
          <p>Входов не записано.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Либо их не было, либо они старше срока хранения.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <ul className="flex flex-col divide-y divide-border">
            {data.items.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-medium">{whenText(row.occurredAt)}</span>
                  <span>{loginMethodLabel(row.method)}</span>
                  <span className="text-muted-foreground">{outcomeLabel(row.outcome)}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 text-muted-foreground">
                  <span>
                    {deviceSummary({
                      deviceKind: row.deviceKind,
                      os: row.os,
                      browser: row.browser,
                    })}
                  </span>
                  {row.ip ? (
                    <Link
                      href={`/app/admin/login-history?ip=${encodeURIComponent(row.ip)}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {row.ip}
                    </Link>
                  ) : (
                    <span>Адрес не записан</span>
                  )}
                  <span>{loginRoleLabel(row.role)}</span>
                </div>
                {ip ? (
                  <div className="text-muted-foreground">
                    <Link
                      href={`/app/admin/login-history?userId=${encodeURIComponent(row.userId)}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Все входы этой учётной записи
                    </Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lastPage > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          <Button
            variant="outline"
            disabled={data.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </Button>
          <span className="text-muted-foreground">
            Страница {data.page} из {lastPage}
          </span>
          <Button
            variant="outline"
            disabled={data.page >= lastPage}
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
          >
            Дальше
          </Button>
        </div>
      ) : null}
    </div>
  );
}
