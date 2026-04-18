"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TemplateOption = { id: string; title: string };

type InstanceSummary = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
};

export function PatientTreatmentProgramsPanel(props: {
  patientUserId: string;
  templates: TemplateOption[];
  disabled?: boolean;
  profileListScope?: string;
}) {
  const { patientUserId, templates, disabled, profileListScope } = props;
  const scopeQs = profileListScope
    ? `?scope=${encodeURIComponent(profileListScope)}`
    : "";
  const [items, setItems] = useState<InstanceSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-program-instances`,
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; items?: InstanceSummary[] };
      if (!res.ok || !data.ok || !data.items) {
        setError("Не удалось загрузить программы");
        setItems([]);
        return;
      }
      setItems(data.items);
    } catch {
      setError("Не удалось загрузить программы");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [patientUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign() {
    if (!selectedTpl || disabled) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-program-instances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: selectedTpl }),
        },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Ошибка назначения");
        return;
      }
      setSelectedTpl("");
      await load();
    } catch {
      setError("Ошибка назначения");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[220px] flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Опубликованный шаблон
          </p>
          <Select
            value={selectedTpl || undefined}
            onValueChange={(v) => setSelectedTpl(v ?? "")}
            disabled={disabled || templates.length === 0}
          >
            <SelectTrigger aria-label="Выбор шаблона программы">
              <SelectValue placeholder={templates.length === 0 ? "Нет шаблонов" : "Выберите шаблон"} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={() => void assign()}
          disabled={disabled || !selectedTpl || assigning || templates.length === 0}
        >
          {assigning ? "Назначение…" : "Назначить программу"}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Назначенные программы
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : !items?.length ? (
          <p className="text-sm text-muted-foreground">Пока нет назначенных программ.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((row) => (
              <li key={row.id} className="rounded-lg border border-border bg-card px-3 py-2">
                <Link
                  href={`/app/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-programs/${encodeURIComponent(row.id)}${scopeQs}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {row.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {row.status === "completed" ? "завершена" : "активна"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
