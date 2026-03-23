"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { pluralizeRu } from "@/shared/lib/pluralize";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { ClientListLink } from "./ClientListLink";
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
};

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

export function DoctorClientsPanel({ allClients, urlParams }: Props) {
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
      router.replace(`/app/doctor/clients${query ? `?${query}` : ""}`);
    },
    [router, urlParams.selected],
  );

  return (
    <>
      <form
        id="doctor-clients-search-form"
        onSubmit={(e) => e.preventDefault()}
        className="stack"
        style={{ marginBottom: "0.5rem" }}
      >
        <input
          type="search"
          className="auth-input"
          placeholder="Поиск (от 3 символов)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск клиентов"
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
        <p className="empty-state">Нет клиентов по текущим фильтрам.</p>
      ) : (
        <ul id="doctor-clients-list" className="list">
          {filtered.map((c) => (
            <li key={c.userId} id={`doctor-clients-item-${c.userId}`} className="list-item">
              <div id={`doctor-clients-card-${c.userId}`} className="client-row">
                <div>
                  <ClientListLink
                    userId={c.userId}
                    searchParams={{
                      telegram: urlParams.telegram === "1" ? "1" : undefined,
                      max: urlParams.max === "1" ? "1" : undefined,
                      appointment: urlParams.appointment === "1" ? "1" : undefined,
                    }}
                  >
                    {c.displayName}
                  </ClientListLink>
                  {c.phone ? <span className="eyebrow" style={{ display: "block", marginTop: 2 }}>{c.phone}</span> : null}
                  {c.nextAppointmentLabel ? (
                    <span className="eyebrow" style={{ display: "block", marginTop: 2, color: "#5f6f86" }}>
                      {c.nextAppointmentLabel}
                    </span>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
