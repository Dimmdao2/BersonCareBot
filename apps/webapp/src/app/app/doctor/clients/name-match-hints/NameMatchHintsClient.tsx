/**
 * Client-only UI for admin name-match hints. Links open the clients hub with scope=all so subscribers
 * without appointments still appear in the list while the detail column loads by selected id.
 */
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Member = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  phoneNormalized: string | null;
  integratorUserId: string | null;
  createdAt: string;
};

type OrderedGroup = {
  normalizedFirst: string;
  normalizedLast: string;
  members: Member[];
};

type SwappedPair = { userA: Member; userB: Member };

type Props = {
  /** Path without query, e.g. `/app/doctor/clients` — links add `scope=all&selected=`. */
  clientsListBase: string;
};

function clientProfileHref(base: string, userId: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}scope=all&selected=${encodeURIComponent(userId)}`;
}

export function NameMatchHintsClient({ clientsListBase }: Props) {
  const [missingPhone, setMissingPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [orderedGroups, setOrderedGroups] = useState<OrderedGroup[] | null>(null);
  const [swappedPairs, setSwappedPairs] = useState<SwappedPair[] | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOrderedGroups(null);
    setSwappedPairs(null);
    setDisclaimer(null);
    try {
      const params = new URLSearchParams();
      if (missingPhone) params.set("missingPhone", "1");
      const res = await fetch(`/api/doctor/clients/name-match-hints?${params.toString()}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        disclaimer?: string;
        orderedGroups?: OrderedGroup[];
        swappedPairs?: SwappedPair[];
      };
      if (!res.ok || !data.ok) {
        setError(
          res.status === 403
            ? "Нужны роль admin и включённый режим администратора."
            : data.error ?? `request_failed_${res.status}`,
        );
        setOrderedGroups(null);
        setSwappedPairs(null);
        setDisclaimer(null);
        return;
      }
      setDisclaimer(data.disclaimer ?? null);
      setOrderedGroups(data.orderedGroups ?? []);
      setSwappedPairs(data.swappedPairs ?? []);
    } catch {
      setError("network");
      setOrderedGroups(null);
      setSwappedPairs(null);
      setDisclaimer(null);
    } finally {
      setLoading(false);
    }
  }, [missingPhone]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <p className="text-muted-foreground text-sm">
        Справочный отчёт для ручной проверки. Совпадения по ФИО не означают, что записи относятся к одному человеку.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={missingPhone}
            onChange={(e) => setMissingPhone(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Только записи без телефона
        </label>
        <Button type="button" onClick={() => void runSearch()} disabled={loading}>
          {loading ? "Загрузка…" : "Запустить поиск"}
        </Button>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {disclaimer ? <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{disclaimer}</p> : null}

      {orderedGroups && orderedGroups.length > 0 ? (
        <section className="space-y-3" aria-labelledby="name-hints-ordered-heading">
          <h2 id="name-hints-ordered-heading" className="text-base font-semibold">
            Кандидаты: одинаковое имя и фамилия (порядок полей как в базе)
          </h2>
          <ul className="space-y-4 list-none p-0 m-0">
            {orderedGroups.map((g) => (
              <li
                key={`${g.normalizedFirst}|${g.normalizedLast}`}
                className="rounded-lg border border-border/70 bg-background p-3"
              >
                <p className="text-xs text-muted-foreground mb-2 font-mono">
                  {g.normalizedFirst} · {g.normalizedLast}
                </p>
                <ul className="m-0 list-none space-y-2 p-0">
                  {g.members.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                      <Link
                        href={clientProfileHref(clientsListBase, m.id)}
                        className={cn("font-medium text-primary underline-offset-4 hover:underline")}
                      >
                        {m.displayName}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{m.id.slice(0, 8)}…</span>
                      <span className="text-xs text-muted-foreground">{m.phoneNormalized ?? "нет тел."}</span>
                      {m.integratorUserId ? (
                        <span className="text-xs text-muted-foreground">int:{m.integratorUserId}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {orderedGroups && orderedGroups.length === 0 && swappedPairs && swappedPairs.length === 0 && !loading && !error ? (
        <p className="text-muted-foreground text-sm">Нет групп по текущим критериям.</p>
      ) : null}

      {swappedPairs && swappedPairs.length > 0 ? (
        <section className="space-y-3" aria-labelledby="name-hints-swapped-heading">
          <h2 id="name-hints-swapped-heading" className="text-base font-semibold">
            Кандидаты: те же токены в полях имя/фамилия, возможно переставлены
          </h2>
          <ul className="m-0 list-none space-y-3 p-0">
            {swappedPairs.map((p) => (
              <li key={`${p.userA.id}-${p.userB.id}`} className="rounded-lg border border-border/70 bg-background p-3 text-sm">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <Link
                      href={clientProfileHref(clientsListBase, p.userA.id)}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {p.userA.displayName}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{p.userA.id.slice(0, 8)}…</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {[p.userA.firstName, p.userA.lastName].filter(Boolean).join(" ") || "—"} ·{" "}
                      {p.userA.phoneNormalized ?? "нет тел."}
                    </p>
                  </div>
                  <div>
                    <Link
                      href={clientProfileHref(clientsListBase, p.userB.id)}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {p.userB.displayName}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{p.userB.id.slice(0, 8)}…</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {[p.userB.firstName, p.userB.lastName].filter(Boolean).join(" ") || "—"} ·{" "}
                      {p.userB.phoneNormalized ?? "нет тел."}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
