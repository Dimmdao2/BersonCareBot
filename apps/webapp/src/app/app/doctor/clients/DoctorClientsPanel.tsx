"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { pluralizeRu } from "@/shared/lib/pluralize";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { ClientsFilters } from "./ClientsFilters";

type UrlParams = {
  q?: string;
  telegram?: string;
  max?: string;
  appointment?: string;
  selected?: string;
};

type Props = {
  allClients: ClientListItem[];
  urlParams: UrlParams;
  /** Путь страницы списка (без завершающего слэша). */
  basePath?: string;
};

const DEFAULT_BASE = "/app/doctor/clients";

function matchesSearch(item: ClientListItem, query: string): boolean {
  const s = query.toLowerCase().trim();
  if (!s) return true;
  return (
    item.displayName.toLowerCase().includes(s) ||
    (item.phone ?? "").toLowerCase().includes(s) ||
    (item.bindings.telegramId ?? "").toLowerCase().includes(s) ||
    (item.bindings.maxId ?? "").toLowerCase().includes(s)
  );
}

export function DoctorClientsPanel({ allClients, urlParams, basePath = DEFAULT_BASE }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(urlParams.q ?? "");

  const filtered = useMemo(() => {
    const q = search.trim();
    let list = allClients;
    if (q.length >= 3) {
      list = list.filter((c) => matchesSearch(c, q));
    }
    if (urlParams.telegram === "1") {
      list = list.filter((c) => Boolean(c.bindings.telegramId?.trim()));
    }
    if (urlParams.max === "1") {
      list = list.filter((c) => Boolean(c.bindings.maxId?.trim()));
    }
    if (urlParams.appointment === "1") {
      list = list.filter((c) => Boolean(c.nextAppointmentLabel));
    }
    return list;
  }, [allClients, search, urlParams.telegram, urlParams.max, urlParams.appointment]);

  const onFiltersChange = useCallback(
    (next: { telegram: boolean; max: boolean; appointment: boolean }) => {
      const params = new URLSearchParams();
      if (next.telegram) params.set("telegram", "1");
      if (next.max) params.set("max", "1");
      if (next.appointment) params.set("appointment", "1");
      if (urlParams.selected) params.set("selected", urlParams.selected);
      const query = params.toString();
      router.replace(`${basePath}${query ? `?${query}` : ""}`);
    },
    [router, urlParams.selected, basePath],
  );

  const onRowClick = useCallback(
    (userId: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        e.preventDefault();
        const params = new URLSearchParams();
        if (urlParams.telegram === "1") params.set("telegram", "1");
        if (urlParams.max === "1") params.set("max", "1");
        if (urlParams.appointment === "1") params.set("appointment", "1");
        params.set("selected", userId);
        router.push(`${basePath}?${params.toString()}`);
      }
    },
    [router, basePath, urlParams.telegram, urlParams.max, urlParams.appointment],
  );

  return (
    <>
      <form
        id="doctor-clients-search-form"
        onSubmit={(e) => e.preventDefault()}
        className="stack mb-2"
      >
        <input
          type="search"
          className="auth-input"
          placeholder="Поиск (от 3 символов)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск в списке"
        />
      </form>

      <ClientsFilters
        defaults={{
          telegram: urlParams.telegram === "1",
          max: urlParams.max === "1",
          appointment: urlParams.appointment === "1",
        }}
        onChange={onFiltersChange}
      />

      {filtered.length === 0 ? (
        <p className="empty-state">Нет записей по текущим фильтрам.</p>
      ) : (
        <ul id="doctor-clients-list" className="list">
          {filtered.map((c) => (
            <li key={c.userId} id={`doctor-clients-item-${c.userId}`} className="list-item p-0">
              <Link
                id={`doctor-clients-card-${c.userId}`}
                href={`${basePath}/${c.userId}`}
                onClick={onRowClick(c.userId)}
                className="client-row block w-full rounded-md px-3 py-3 text-left no-underline transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div>
                  <span className="font-semibold text-foreground">{c.displayName}</span>
                  {c.phone ? <span className="eyebrow mt-0.5 block">{c.phone}</span> : null}
                  {c.nextAppointmentLabel ? (
                    <span className="eyebrow mt-0.5 block text-muted-foreground">{c.nextAppointmentLabel}</span>
                  ) : null}
                </div>
                <div className="client-row__badges">
                  {c.bindings.telegramId ? <span className="badge badge--channel">TG</span> : null}
                  {c.bindings.maxId ? <span className="badge badge--channel">MAX</span> : null}
                  {c.cancellationCount30d > 0 ? (
                    <span className="badge badge--warning">
                      {c.cancellationCount30d} {pluralizeRu(c.cancellationCount30d, "отмена", "отмены", "отмен")}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
