"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AuditItem = {
  id: string;
  action: string;
  target_id: string | null;
  conflict_key: string | null;
  status: "ok" | "partial_failure" | "error";
  repeat_count: number;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
};

type Props = {
  platformUserId: string;
  enabled: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string | null): boolean {
  return s != null && s.length > 0 && UUID_RE.test(s);
}

export function AdminClientAuditHistorySection({ platformUserId, enabled }: Props) {
  const [open, setOpen] = useState(false);
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
    if (!enabled || !open) return;
    void load();
  }, [enabled, open, load]);

  if (!enabled) return null;

  const openConflictsHere = items.filter(
    (r) => r.action === "auto_merge_conflict" && r.resolved_at == null && r.conflict_key,
  );

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3"
      aria-labelledby="admin-client-audit-history-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="admin-client-audit-history-heading" className="text-base font-semibold">
          История операций (audit)
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Свернуть" : "Развернуть"}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Записи журнала, где этот пользователь встречается как{" "}
        <span className="font-mono">target_id</span>, в кандидатах{" "}
        <span className="font-mono">auto_merge_conflict</span> или в паре слияния{" "}
        <span className="font-mono">user_merge</span> (<span className="font-mono">details.targetId</span> /{" "}
        <span className="font-mono">duplicateId</span>). Нерешённые конфликты помечены отдельно.
      </p>
      {openConflictsHere.length > 0 ? (
        <p className="text-sm text-amber-800 dark:text-amber-300" role="status">
          Нерешённых <span className="font-mono">auto_merge_conflict</span> среди загруженных строк (до 20), не повторы
          события:{" "}
          <Badge variant="outline" className="font-mono">
            {openConflictsHere.length}
          </Badge>
        </p>
      ) : null}

      {!open ? null : (
        <>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              Не удалось загрузить журнал ({error}).
            </p>
          ) : null}
          {loading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Записей по этому пользователю пока нет.</p>
          ) : null}
          {!loading && items.length > 0 ? (
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
                    {row.action === "auto_merge_conflict" && row.resolved_at == null && row.conflict_key ? (
                      <span className="text-amber-700 dark:text-amber-400">открыт</span>
                    ) : null}
                  </div>
                  {row.target_id && isUuid(row.target_id) ? (
                    <Link href={`/app/doctor/clients/${encodeURIComponent(row.target_id)}`} className="font-mono break-all text-primary underline">
                      target: {row.target_id}
                    </Link>
                  ) : row.target_id ? (
                    <span className="font-mono break-all">target: {row.target_id}</span>
                  ) : null}
                  {row.action === "auto_merge_conflict" && row.repeat_count > 1 ? (
                    <span className="text-muted-foreground">Повторов: {row.repeat_count}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
