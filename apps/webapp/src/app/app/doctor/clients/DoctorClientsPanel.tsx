"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralizeRu } from "@/shared/lib/pluralize";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { ClientsFilters } from "./ClientsFilters";

type ClientsScope = "all" | "appointments" | "archived";

type UrlParams = {
  q?: string;
  telegram?: string;
  max?: string;
  appointment?: string;
  visitedMonth?: string;
  selected?: string;
  scope?: string;
};

type Props = {
  allClients: ClientListItem[];
  urlParams: UrlParams;
  /** Путь страницы списка (без завершающего слэша). */
  basePath?: string;
  /** Ссылка на отчёт по ФИО: только admin + admin mode. */
  showAdminNameMatchHintsLink?: boolean;
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

function appendListQueryParams(params: URLSearchParams, urlParams: UrlParams): void {
  const scope: ClientsScope =
    urlParams.scope === "all" ? "all" : urlParams.scope === "archived" ? "archived" : "appointments";
  params.set("scope", scope);
  if (urlParams.telegram === "1") params.set("telegram", "1");
  if (urlParams.max === "1") params.set("max", "1");
  if (urlParams.appointment === "1") params.set("appointment", "1");
  if (scope === "appointments" && urlParams.visitedMonth === "1") params.set("visitedMonth", "1");
}

export function DoctorClientsPanel({
  allClients,
  urlParams,
  basePath = DEFAULT_BASE,
  showAdminNameMatchHintsLink = false,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(urlParams.q ?? "");
  const scope: ClientsScope =
    urlParams.scope === "all" ? "all" : urlParams.scope === "archived" ? "archived" : "appointments";
  const showVisitedMonthFilter = scope === "appointments";

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
    (next: { telegram: boolean; max: boolean; appointment: boolean; visitedMonth: boolean }) => {
      const params = new URLSearchParams();
      params.set("scope", scope);
      if (next.telegram) params.set("telegram", "1");
      if (next.max) params.set("max", "1");
      if (next.appointment) params.set("appointment", "1");
      if (scope === "appointments" && next.visitedMonth) params.set("visitedMonth", "1");
      if (urlParams.selected) params.set("selected", urlParams.selected);
      const query = params.toString();
      router.replace(`${basePath}${query ? `?${query}` : ""}`);
    },
    [router, scope, urlParams.selected, basePath],
  );

  const onScopeChange = useCallback(
    (nextScope: ClientsScope) => {
      if (nextScope === scope) return;
      const params = new URLSearchParams();
      params.set("scope", nextScope);
      if (urlParams.telegram === "1") params.set("telegram", "1");
      if (urlParams.max === "1") params.set("max", "1");
      if (urlParams.appointment === "1") params.set("appointment", "1");
      if (nextScope === "appointments" && urlParams.visitedMonth === "1") params.set("visitedMonth", "1");
      if (urlParams.selected) params.set("selected", urlParams.selected);
      router.replace(`${basePath}?${params.toString()}`);
    },
    [
      basePath,
      router,
      scope,
      urlParams.appointment,
      urlParams.max,
      urlParams.selected,
      urlParams.telegram,
      urlParams.visitedMonth,
    ],
  );

  const onRowClick = useCallback(
    (userId: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        e.preventDefault();
        const params = new URLSearchParams();
        appendListQueryParams(params, urlParams);
        params.set("selected", userId);
        router.push(`${basePath}?${params.toString()}`);
      }
    },
    [router, basePath, urlParams],
  );

  return (
    <>
      <form
        id="doctor-clients-search-form"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-4 mb-2"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={scope === "appointments" ? "default" : "outline"}
            onClick={() => onScopeChange("appointments")}
            id="doctor-clients-scope-appointments"
          >
            Клиенты с записями
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === "all" ? "default" : "outline"}
            onClick={() => onScopeChange("all")}
            id="doctor-clients-scope-all"
          >
            Все подписчики
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === "archived" ? "default" : "outline"}
            onClick={() => onScopeChange("archived")}
            id="doctor-clients-scope-archived"
          >
            Архив
          </Button>
        </div>
        <Input
          type="search"
          placeholder="Поиск (от 3 символов)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск в списке"
        />
        {search.length > 0 && search.trim().length < 3 ? (
          <p className="text-muted-foreground text-xs">Введите еще {3 - search.trim().length} симв.</p>
        ) : null}
      </form>

      <ClientsFilters
        defaults={{
          telegram: urlParams.telegram === "1",
          max: urlParams.max === "1",
          appointment: urlParams.appointment === "1",
          visitedMonth: urlParams.visitedMonth === "1",
        }}
        onChange={onFiltersChange}
        showVisitedMonthFilter={showVisitedMonthFilter}
      />

      {showAdminNameMatchHintsLink ? (
        <p className="text-sm">
          <Link
            href="/app/doctor/clients/name-match-hints"
            className="text-primary underline-offset-4 hover:underline font-medium"
          >
            Кандидаты по совпадению ФИО (справочно)
          </Link>
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-muted-foreground">Нет записей по текущим фильтрам.</p>
      ) : (
        <ul id="doctor-clients-list" className="m-0 list-none space-y-3 p-0">
          {filtered.map((c) => (
            <li key={c.userId} id={`doctor-clients-item-${c.userId}`} className="rounded-lg border border-border bg-card p-0">
              <Link
                id={`doctor-clients-card-${c.userId}`}
                href={`${basePath}/${c.userId}?scope=${scope}`}
                onClick={onRowClick(c.userId)}
                className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-3 text-left no-underline transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div>
                  <span className="font-semibold text-foreground">{c.displayName}</span>
                  {c.phone ? <span className="mt-0.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.phone}</span> : null}
                  {c.nextAppointmentLabel ? (
                    <span className="mt-0.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.nextAppointmentLabel}</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {c.bindings.telegramId ? (
                    <Badge variant="secondary" className="font-normal">
                      TG
                    </Badge>
                  ) : null}
                  {c.bindings.maxId ? (
                    <Badge variant="secondary" className="font-normal">
                      MAX
                    </Badge>
                  ) : null}
                  {c.cancellationCount30d > 0 ? (
                    <Badge variant="destructive" className="font-normal">
                      {c.cancellationCount30d} {pluralizeRu(c.cancellationCount30d, "отмена", "отмены", "отмен")}
                    </Badge>
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
