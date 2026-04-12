"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AuditLogMergeTarget } from "@/components/admin/AuditLogMergeTarget";
import { auditActorShortLabel } from "@/infra/adminAuditLogPresentation";

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
};

type Props = {
  platformUserId: string;
  enabled: boolean;
  /** When true, do not load audit rows until expanded (e.g. accordion). */
  suspendLoad?: boolean;
};

export function AdminClientAuditHistorySection({ platformUserId, enabled, suspendLoad = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: "1",
        limit: "20",
        involvesPlatformUserId: platformUserId,
      });
      const res = await fetch(`/api/admin/audit-log?${qs.toString()}`, { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; items?: AuditItem[]; error?: string };
      if (!res.ok || json.ok !== true) {
        setError(res.status === 403 ? "Нужны роль admin и режим администратора." : json.error ?? "request_failed");
        setItems([]);
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setError("network");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [platformUserId]);

  useEffect(() => {
    if (!enabled || suspendLoad) return;
    void load();
  }, [enabled, suspendLoad, load]);

  if (!enabled) return null;

  const openConflictsHere = items.filter(
    (r) => r.action === "auto_merge_conflict" && r.resolved_at == null && r.conflict_key,
  );

  return (
    <div className="flex flex-col gap-3" aria-labelledby="admin-client-audit-history-heading">
      <h2 id="admin-client-audit-history-heading" className="text-base font-semibold">
        История операций (audit)
      </h2>
      {openConflictsHere.length > 0 ? (
        <p className="text-sm text-amber-800 dark:text-amber-300" role="status">
          Открытых конфликтов среди загруженных строк:{" "}
          <Badge variant="outline" className="font-mono">
            {openConflictsHere.length}
          </Badge>
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          Не удалось загрузить журнал ({error}).
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : null}
      {!loading && !suspendLoad && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Записей по этому пользователю пока нет.</p>
      ) : null}
      {!loading && !suspendLoad && items.length > 0 ? (
        <ul className="m-0 list-none space-y-2 p-0" id="admin-client-audit-history-list">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs flex flex-col gap-1"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {row.action}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {row.status}
                </Badge>
                <span className="text-muted-foreground">актор: {auditActorShortLabel(row.actor_id, row.action)}</span>
                {row.action === "auto_merge_conflict" && row.resolved_at == null && row.conflict_key ? (
                  <span className="text-amber-700 dark:text-amber-400">открыт</span>
                ) : null}
              </div>
              <div className="text-[11px] text-muted-foreground">Цель</div>
              <AuditLogMergeTarget row={row} />
              {row.action === "auto_merge_conflict" && row.repeat_count > 1 ? (
                <span className="text-muted-foreground">Повторов: {row.repeat_count}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
