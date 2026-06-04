"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { AdminMergeAccountsPanel } from "@/app/app/doctor/clients/AdminMergeAccountsPanel";
import type { PatientMergeCandidateRecord } from "@/modules/patient-merge-candidate/ports";

const BASE = "/api/admin/booking-engine/merge-candidates";

export function BookingMergeCandidatesSection() {
  const [items, setItems] = useState<PatientMergeCandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(BASE, { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        candidates?: PatientMergeCandidateRecord[];
      };
      if (!res.ok || !json.ok) {
        if (res.status === 403) {
          setError("Нужна роль admin и включённый режим администратора.");
        } else {
          setError("Не удалось загрузить кандидатов");
        }
        setItems([]);
        return;
      }
      setItems(json.candidates ?? []);
    } catch {
      setError("Ошибка сети");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function dismiss(id: string) {
    const res = await fetch(`${BASE}/${id}/dismiss`, { method: "POST" });
    if (res.ok) {
      if (expandedRowId === id) setExpandedRowId(null);
      void load();
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Кандидаты на объединение (запись с сайта)</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Обновить
        </Button>
      </div>
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Загрузка…</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Нет ожидающих кандидатов.</p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((row) => (
          <li key={row.id} className="rounded border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Якорь{" "}
                <Link href={`/app/doctor/clients/${row.anchorUserId}`} className="text-primary underline">
                  {row.anchorUserId.slice(0, 8)}…
                </Link>
                {" · "}
                кандидат{" "}
                <Link href={`/app/doctor/clients/${row.candidateUserId}`} className="text-primary underline">
                  {row.candidateUserId.slice(0, 8)}…
                </Link>
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedRowId((cur) => (cur === row.id ? null : row.id))}
                >
                  {expandedRowId === row.id ? "Свернуть" : "Объединить"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void dismiss(row.id)}>
                  Отклонить
                </Button>
              </div>
            </div>
            {expandedRowId === row.id ? (
              <div className="mt-3 border-t pt-3">
                <AdminMergeAccountsPanel
                  key={row.id}
                  anchorUserId={row.anchorUserId}
                  initialSecondUserId={row.candidateUserId}
                  enabled
                  suspendHeavyFetch={false}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
