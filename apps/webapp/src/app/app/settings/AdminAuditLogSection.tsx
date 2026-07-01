"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { cn } from "@/lib/utils";
import { AuditLogMergeTarget } from "@/components/admin/AuditLogMergeTarget";
import { auditActorShortLabel } from "@/infra/adminAuditLogPresentation";
import { CopyForAiButton } from "./CopyForAiButton";
import { apiJson } from "@/shared/lib/apiJson";

type AuditItem = {
  id: string;
  actor_id: string | null;
  action: string;
  target_id: string | null;
  conflict_key: string | null;
  details: Record<string, unknown>;
  status: "ok" | "partial_failure" | "error";
  repeat_count: number;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
  actor_display_name: string | null;
};

type ApiOk = {
  ok: true;
  items: AuditItem[];
  total: number;
  page: number;
  limit: number;
  /** Open `auto_merge_conflict` rows (`resolved_at IS NULL`), distinct keys. */
  openAutoMergeConflictCount?: number;
};

const ACTION_FILTER_ALL = "";
const ACTION_FILTER_SYSTEM_HEALTH = "__system_health__";

const ACTION_FILTER_OPTIONS = [
  { value: ACTION_FILTER_ALL, label: "Все действия" },
  { value: ACTION_FILTER_SYSTEM_HEALTH, label: "Системные снимки" },
  { value: "auth_register_failure", label: "Сбои регистрации" },
  { value: "auto_merge_conflict", label: "auto_merge_conflict" },
  { value: "auto_merge_conflict_anomaly", label: "auto_merge_conflict_anomaly" },
  { value: "email_auth_conflict", label: "email_auth_conflict" },
  { value: "messenger_phone_bind_blocked", label: "messenger_phone_bind_blocked" },
  { value: "messenger_phone_bind_anomaly", label: "messenger_phone_bind_anomaly" },
  { value: "user_purge", label: "user_purge" },
  { value: "user_purge_external_retry", label: "user_purge_external_retry" },
  { value: "user_merge", label: "user_merge" },
  { value: "integrator_user_merge", label: "integrator_user_merge" },
  { value: "admin_client_profile_patch", label: "admin_client_profile_patch" },
  { value: "health_failure_archive_clear_dead", label: "health_failure_archive_clear_dead" },
  { value: "operator_incidents_resolve_all", label: "operator_incidents_resolve_all" },
] as const;

function actionTierLabel(action: string): string {
  const tier1 = new Set([
    "user_purge",
    "user_purge_external_retry",
    "user_merge",
    "integrator_user_merge",
    "appointment_soft_delete",
    "media_delete",
    "reference_archive",
    "health_failure_archive_clear_dead",
    "operator_incidents_resolve_all",
  ]);
  const tier2 = new Set([
    "settings_change",
    "doctor_settings_change",
    "google_calendar_connect",
    "admin_mode_toggle",
  ]);
  if (tier1.has(action)) return "Высокий риск";
  if (tier2.has(action)) return "Конфигурация";
  if (action.startsWith("catalog_") || action.startsWith("rubitime_mapping_")) return "Каталог";
  if (
    action.startsWith("user_") ||
    action === "intake_status_change" ||
    action === "admin_client_profile_patch" ||
    action.startsWith("auto_merge_conflict") ||
    action === "email_auth_conflict" ||
    action.startsWith("messenger_phone_bind")
  ) {
    return "Клиент / данные";
  }
  return "Прочее";
}

function statusBadgeVariant(status: AuditItem["status"]): "secondary" | "outline" | "destructive" {
  if (status === "ok") return "secondary";
  if (status === "partial_failure") return "outline";
  return "destructive";
}

function canManuallyResolveAuditRow(row: AuditItem): boolean {
  if (row.resolved_at != null) return false;
  return (
    row.action === "auto_merge_conflict" ||
    row.action === "auto_merge_conflict_anomaly" ||
    row.action === "email_auth_conflict" ||
    row.action === "messenger_phone_bind_blocked" ||
    row.action === "messenger_phone_bind_anomaly" ||
    row.action === "channel_link_ownership_conflict"
  );
}

function isOpenConflictLabel(row: AuditItem): boolean {
  if (row.resolved_at != null) return false;
  if (row.action === "auto_merge_conflict" && row.conflict_key) return true;
  if (row.action === "auto_merge_conflict_anomaly") return true;
  if (row.action === "email_auth_conflict" && row.conflict_key) return true;
  if (row.action === "messenger_phone_bind_blocked" && row.conflict_key) return true;
  if (row.action === "messenger_phone_bind_anomaly") return true;
  if (row.action === "channel_link_ownership_conflict") return true;
  return false;
}

type FilterState = {
  action: string;
  target: string;
  status: "" | AuditItem["status"];
  from: string;
  to: string;
};

const emptyFilters = (): FilterState => ({
  action: "",
  target: "",
  status: "",
  from: "",
  to: "",
});

export function AdminAuditLogSection() {
  const searchParams = useSearchParams();
  const [applied, setApplied] = useState<FilterState>(emptyFilters);
  const [draft, setDraft] = useState<FilterState>(emptyFilters);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", String(limit));
    if (applied.action === ACTION_FILTER_SYSTEM_HEALTH) {
      p.set("systemHealthOnly", "1");
    } else if (applied.action.trim()) {
      p.set("action", applied.action.trim());
    } else {
      p.set("excludeSystemHealth", "1");
    }
    if (applied.target.trim()) p.set("target", applied.target.trim());
    if (applied.status) p.set("status", applied.status);
    if (applied.from) p.set("from", applied.from);
    if (applied.to) p.set("to", applied.to);
    return p.toString();
  }, [applied, page, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiJson<ApiOk>(`/api/admin/audit-log?${queryString}`, { credentials: "include" });
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const action = searchParams.get("action")?.trim() ?? "";
    if (!action) return;
    const known = ACTION_FILTER_OPTIONS.some((o) => o.value === action);
    if (!known) return;
    setApplied((prev) => (prev.action === action ? prev : { ...prev, action }));
    setDraft((prev) => (prev.action === action ? prev : { ...prev, action }));
  }, [searchParams]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const visibleItems = data?.items ?? [];

  return (
    <Card id="admin-audit-log">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">Лог операций</CardTitle>
          {data != null &&
          typeof data.openAutoMergeConflictCount === "number" &&
          data.openAutoMergeConflictCount > 0 ? (
            <Badge variant="destructive" className="font-mono text-xs" title="Нерешённых auto_merge_conflict (открытых строк)">
              auto_merge_conflict: {data.openAutoMergeConflictCount}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          Журнал действий администратора и опасных операций. Записи дополняются по мере внедрения сценариев
          (purge, merge, настройки и т.д.). Счётчик по открытым конфликтам интеграции — по строкам с{" "}
          <span className="font-mono">resolved_at IS NULL</span>, без дублирования по повторам одного ключа.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="audit-action">Тип действия</Label>
            <select
              id="audit-action"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              {ACTION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value || "_all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-target">Цель (target_id)</Label>
            <Input
              id="audit-target"
              value={draft.target}
              onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}
              placeholder="UUID или произвольный id"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-status">Статус</Label>
            <select
              id="audit-status"
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as FilterState["status"] }))}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              <option value="">Все</option>
              <option value="ok">ok</option>
              <option value="partial_failure">partial_failure</option>
              <option value="error">error</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-from">Дата с</Label>
            <Input
              id="audit-from"
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to">Дата по</Label>
            <Input
              id="audit-to"
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => {
                setApplied({ ...draft });
                setPage(1);
              }}
            >
              Применить фильтры
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            Не удалось загрузить журнал ({error}).
          </p>
        )}

        {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

        {!loading && data && (
          <>
            <p className="text-sm text-muted-foreground">
              Записей: {data.total}. Страница {data.page} из {totalPages}.
              {applied.action === "" ? " Системные снимки скрыты — фильтр «Системные снимки»." : null}
            </p>
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Когда</th>
                    <th className="px-3 py-2 font-medium">Действие</th>
                    <th className="px-3 py-2 font-medium">Цель</th>
                    <th className="px-3 py-2 font-medium">Актор</th>
                    <th className="px-3 py-2 font-medium">Статус</th>
                    <th className="px-3 py-2 font-medium w-10" />
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        Пока нет записей.
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((row) => {
                      const expanded = openId === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr className="border-t border-border/50 hover:bg-muted/30">
                            <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(row.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex flex-wrap items-center gap-1">
                                <Badge variant="outline" className="font-mono text-[10px]">
                                  {row.action}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">{actionTierLabel(row.action)}</span>
                              </div>
                              {row.action === "auto_merge_conflict" && row.repeat_count > 1 && (
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  Повторов: {row.repeat_count}, последнее:{" "}
                                  {new Date(row.last_seen_at).toLocaleString()}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <AuditLogMergeTarget row={row} />
                            </td>
                            <td className="px-3 py-2 align-top text-xs">
                              {auditActorShortLabel(row.actor_id, row.action)}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex flex-col gap-1">
                                <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
                                {isOpenConflictLabel(row) ? (
                                  <span className="text-[10px] text-amber-700 dark:text-amber-400">конфликт открыт</span>
                                ) : null}
                                {row.resolved_at ? (
                                  <span className="text-[10px] text-muted-foreground">
                                    закрыт {new Date(row.resolved_at).toLocaleString()}
                                  </span>
                                ) : null}
                                {canManuallyResolveAuditRow(row) ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 mt-1 text-[10px]"
                                    disabled={resolvingId === row.id}
                                    onClick={async () => {
                                      setResolvingId(row.id);
                                      setError(null);
                                      try {
                                        await apiJson<{ ok: boolean }>("/api/admin/audit-log/resolve", {
                                          method: "POST",
                                          credentials: "include",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ id: row.id }),
                                        });
                                        await load();
                                      } catch (e) {
                                        setError(e instanceof Error ? e.message : "close_failed");
                                      } finally {
                                        setResolvingId(null);
                                      }
                                    }}
                                  >
                                    Закрыть
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex flex-col gap-1">
                                <CopyForAiButton
                                  payload={row as unknown as Record<string, unknown>}
                                  label="Скопировать"
                                  className="h-7 px-2 text-[10px]"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => setOpenId(expanded ? null : row.id)}
                                >
                                  {expanded ? "Скрыть" : "Детали"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="border-t border-border/40 bg-muted/20">
                              <td colSpan={6} className="px-3 py-3">
                                <pre className="max-h-64 overflow-auto rounded-md border border-border/50 bg-background p-3 text-[11px] leading-relaxed">
                                  {JSON.stringify(
                                    {
                                      id: row.id,
                                      conflict_key: row.conflict_key,
                                      details: row.details,
                                    },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Вперёд
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
