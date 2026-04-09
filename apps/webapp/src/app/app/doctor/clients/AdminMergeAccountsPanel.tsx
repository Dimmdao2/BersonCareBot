"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";
import {
  buildDefaultManualMergeResolution,
  canSubmitManualMerge,
  getAlignedMergePreviewRequest,
  hardBlockerUi,
  uuidEqualsNormalized,
  type MergePreviewApiOk,
} from "./adminMergeAccountsLogic";

type CandidateRow = {
  id: string;
  displayName: string;
  phoneNormalized: string | null;
  email: string | null;
  integratorUserId: string | null;
  createdAt: string;
};

type Props = {
  anchorUserId: string;
  /** Admin + admin mode — same guard as merge API */
  enabled: boolean;
};

const SCALAR_LABELS: Record<keyof ManualMergeResolution["fields"], string> = {
  phone_normalized: "Телефон (норм.)",
  display_name: "Отображаемое имя",
  first_name: "Имя",
  last_name: "Фамилия",
  email: "Email",
};

const CH_LABELS: Record<keyof ManualMergeResolution["bindings"], string> = {
  telegram: "Telegram",
  max: "Max",
  vk: "VK",
};

function FieldCell({ v }: { v: string | null }) {
  return <span className="break-all font-mono text-xs">{v ?? "—"}</span>;
}

export function AdminMergeAccountsPanel({ anchorUserId, enabled }: Props) {
  const router = useRouter();
  const [sectionOpen, setSectionOpen] = useState(false);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<CandidateRow[] | null>(null);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState<string | null>(null);

  const [duplicateId, setDuplicateId] = useState<string>("");
  const [preview, setPreview] = useState<MergePreviewApiOk | null>(null);
  const [resolution, setResolution] = useState<ManualMergeResolution | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setCandLoading(true);
    setCandError(null);
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(anchorUserId)}/merge-candidates${qs}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as { ok?: boolean; candidates?: CandidateRow[]; error?: string };
      if (!res.ok || !data.ok) {
        if (res.status === 403) {
          setCandError("Нужны роль admin и включённый режим администратора.");
        } else {
          setCandError(data.error ?? `load_failed_${res.status}`);
        }
        setCandidates(null);
        return;
      }
      setCandidates(data.candidates ?? []);
    } catch {
      setCandError("network");
      setCandidates(null);
    } finally {
      setCandLoading(false);
    }
  }, [anchorUserId, q]);

  useEffect(() => {
    if (!enabled || !sectionOpen) return;
    void loadCandidates();
  }, [enabled, sectionOpen, loadCandidates]);

  const loadAlignedPreview = useCallback(
    async (first: { targetId: string; duplicateId: string }) => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const url = `/api/doctor/clients/merge-preview?targetId=${encodeURIComponent(first.targetId)}&duplicateId=${encodeURIComponent(first.duplicateId)}`;
        const res = await fetch(url, { credentials: "include" });
        const data = (await res.json()) as MergePreviewApiOk | { ok: false; error?: string; message?: string };
        if (!res.ok || !data || (data as MergePreviewApiOk).ok !== true) {
          const err = data as { error?: string; message?: string };
          const pe =
            res.status === 403
              ? "Нужны роль admin и включённый режим администратора."
              : err.message ?? err.error ?? `preview_failed_${res.status}`;
          setPreviewError(pe);
          setPreview(null);
          setResolution(null);
          return;
        }
        const ok = data as MergePreviewApiOk;
        const aligned = getAlignedMergePreviewRequest(anchorUserId, first.duplicateId, ok);
        if (aligned.shouldRefetch) {
          const res2 = await fetch(
            `/api/doctor/clients/merge-preview?targetId=${encodeURIComponent(aligned.targetId)}&duplicateId=${encodeURIComponent(aligned.duplicateId)}`,
            { credentials: "include" },
          );
          const data2 = (await res2.json()) as MergePreviewApiOk | { ok: false };
          if (!res2.ok || !data2 || (data2 as MergePreviewApiOk).ok !== true) {
            setPreviewError(
              res2.status === 403
                ? "Нужны роль admin и включённый режим администратора."
                : "preview_align_failed",
            );
            setPreview(null);
            setResolution(null);
            return;
          }
          const ok2 = data2 as MergePreviewApiOk;
          setPreview(ok2);
          setResolution(buildDefaultManualMergeResolution(ok2));
          return;
        }
        setPreview(ok);
        setResolution(buildDefaultManualMergeResolution(ok));
      } catch {
        setPreviewError("network");
        setPreview(null);
        setResolution(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [anchorUserId],
  );

  useEffect(() => {
    if (!duplicateId || !enabled) {
      setPreview(null);
      setResolution(null);
      setPreviewError(null);
      return;
    }
    void loadAlignedPreview({ targetId: anchorUserId, duplicateId });
  }, [anchorUserId, duplicateId, enabled, loadAlignedPreview]);

  const canMerge = preview && resolution ? canSubmitManualMerge(preview, resolution) : false;

  const summaryLines = useMemo(() => {
    if (!preview || !resolution) return [];
    const lines: string[] = [];
    lines.push(`Каноническая запись (остаётся): ${preview.targetId}`);
    lines.push(`Дубликат (станет алиасом): ${preview.duplicateId}`);
    for (const k of Object.keys(resolution.fields) as (keyof ManualMergeResolution["fields"])[]) {
      const side = resolution.fields[k];
      lines.push(`${SCALAR_LABELS[k]}: победитель — ${side === "target" ? "целевой" : "дубликат"}`);
    }
    for (const ch of ["telegram", "max", "vk"] as const) {
      const w = resolution.bindings[ch];
      if (w === "both") lines.push(`${CH_LABELS[ch]}: без конфликта (перенос привязок как при авто-merge)`);
      else lines.push(`${CH_LABELS[ch]}: оставить привязку стороны «${w === "target" ? "целевая" : "дубликат"}»`);
    }
    if (Object.keys(resolution.oauth).length > 0) {
      for (const [prov, side] of Object.entries(resolution.oauth)) {
        lines.push(`OAuth ${prov}: ${side === "target" ? "целевая" : "дубликат"}`);
      }
    }
    lines.push(
      `Предпочтения каналов: ${
        resolution.channelPreferences === "keep_target"
          ? "только целевой"
          : resolution.channelPreferences === "keep_newer"
            ? "новее по updated_at"
            : "слияние (merge)"
      }`,
    );
    lines.push("Медиа: uploaded_by дубликата переносится на целевого (как в движке merge).");
    return lines;
  }, [preview, resolution]);

  async function runMerge() {
    if (!preview || !resolution || !canMerge) return;
    if (
      !window.confirm(
        "Объединить учётные записи?\n\n" +
          "Дубликат станет алиасом (merged_into_id), его strong id будут очищены. " +
          "Дальше потребуется ввести UUID дубликата для подтверждения.",
      )
    ) {
      return;
    }
    const typed = window.prompt(
      `Введите UUID дубликата для подтверждения merge:\n(${preview.duplicateId})`,
    );
    if (typed === null) return;
    if (!uuidEqualsNormalized(typed, preview.duplicateId)) {
      setMsg("UUID не совпал — merge отменён.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/doctor/clients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resolution }),
      });
      let data: { ok?: boolean; error?: string; message?: string };
      try {
        data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      } catch {
        setMsg(
          res.status === 403
            ? "Доступ запрещён: нужны роль admin и режим администратора."
            : `Ответ сервера без JSON (HTTP ${res.status}).`,
        );
        return;
      }
      if (!res.ok || !data.ok) {
        const hint =
          res.status === 403
            ? "Доступ запрещён: нужны роль admin и режим администратора."
            : data.message ?? data.error ?? `merge_failed (HTTP ${res.status})`;
        setMsg(hint);
        return;
      }
      setMsg("Объединение выполнено.");
      setDuplicateId("");
      setPreview(null);
      setResolution(null);
      setCandidates(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <section
      className="rounded-2xl border border-violet-500/35 bg-card p-4 shadow-sm flex flex-col gap-3"
      aria-labelledby="admin-merge-accounts-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="admin-merge-accounts-heading" className="text-base font-semibold">
          Объединение учётных записей (admin)
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSectionOpen((o) => !o)}
          aria-expanded={sectionOpen}
        >
          {sectionOpen ? "Свернуть" : "Развернуть"}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Сравнение двух канонических клиентов, явный выбор победителей по полям и привязкам, затем ручной merge через
        API (тот же контракт, что preview/POST merge).
      </p>

      {!sectionOpen ? null : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="merge-cand-q">Поиск среди кандидатов</Label>
              <Input
                id="merge-cand-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Подстрока id, телефона, email, имени…"
                className="font-mono text-sm"
              />
            </div>
            <Button type="button" variant="secondary" disabled={candLoading} onClick={() => void loadCandidates()}>
              {candLoading ? "…" : "Обновить список"}
            </Button>
          </div>
          {candError ? (
            <p className="text-sm text-destructive" role="alert">
              Не удалось загрузить кандидатов ({candError}).
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="merge-dup-select">Вторая запись (дубликат)</Label>
            <select
              id="merge-dup-select"
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
              value={duplicateId}
              onChange={(e) => setDuplicateId(e.target.value)}
            >
              <option value="">— выберите —</option>
              {(candidates ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} · {c.phoneNormalized ?? "нет тел."} · {c.id.slice(0, 8)}…
                </option>
              ))}
            </select>
          </div>

          {previewLoading ? <p className="text-sm text-muted-foreground">Загрузка сравнения…</p> : null}
          {previewError ? (
            <p className="text-sm text-destructive" role="alert">
              {previewError}
            </p>
          ) : null}

          {preview && resolution ? (
            <div className="space-y-4 border-t border-border/60 pt-4">
              {preview.hardBlockers.length > 0 ? (
                <div
                  className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2"
                  role="alert"
                  id="admin-merge-hard-blockers"
                >
                  <p className="font-medium text-destructive">Жёсткие блокировки — merge недоступен</p>
                  <ul className="list-disc space-y-2 pl-4">
                    {preview.hardBlockers.map((b) => {
                      const ru = hardBlockerUi(b.code);
                      return (
                        <li key={b.code}>
                          <span className="font-medium">{ru.title}</span>
                          <span className="block text-muted-foreground text-xs mt-0.5">{ru.detail}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {preview.mergeAllowed &&
              preview.hardBlockers.length === 0 &&
              !preview.v1MergeEngineCallable ? (
                <div
                  className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100"
                  role="note"
                >
                  <p className="font-medium">Ограничение авто-merge (v1)</p>
                  <p className="mt-1 text-muted-foreground dark:text-amber-200/90">
                    Флаг <span className="font-mono">v1MergeEngineCallable</span> = false: старый путь merge без явного
                    выбора полей (projection / phone_bind) для этой пары вызвал бы ошибку (часто из‑за двух разных
                    non-null телефонов). Ручной merge с выбранным <span className="font-mono">resolution</span> всё
                    равно допустим, если нет жёстких блокировок выше.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-border/70 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Целевой (канон)</p>
                  <p className="font-mono text-xs break-all">{preview.targetId}</p>
                  <p className="mt-2 text-sm">{preview.target.displayName}</p>
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Дубликат</p>
                  <p className="font-mono text-xs break-all">{preview.duplicateId}</p>
                  <p className="mt-2 text-sm">{preview.duplicate.displayName}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <p className="text-sm font-medium mb-2">Поля (рядом)</p>
                <table className="w-full min-w-[560px] text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2">Поле</th>
                      <th className="py-2 pr-2">Целевой</th>
                      <th className="py-2 pr-2">Дубликат</th>
                      <th className="py-2">Выбор</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(SCALAR_LABELS) as (keyof typeof SCALAR_LABELS)[]).map((field) => {
                      const conflict = preview.scalarConflicts.some((c) => c.field === field);
                      const t =
                        field === "phone_normalized"
                          ? preview.target.phoneNormalized
                          : field === "display_name"
                            ? preview.target.displayName
                            : field === "first_name"
                              ? preview.target.firstName
                              : field === "last_name"
                                ? preview.target.lastName
                                : preview.target.email;
                      const d =
                        field === "phone_normalized"
                          ? preview.duplicate.phoneNormalized
                          : field === "display_name"
                            ? preview.duplicate.displayName
                            : field === "first_name"
                              ? preview.duplicate.firstName
                              : field === "last_name"
                                ? preview.duplicate.lastName
                                : preview.duplicate.email;
                      return (
                        <tr key={field} className="border-b border-border/40 align-top">
                          <td className="py-2 pr-2 whitespace-nowrap">{SCALAR_LABELS[field]}</td>
                          <td className="py-2 pr-2">
                            <FieldCell v={t} />
                          </td>
                          <td className="py-2 pr-2">
                            <FieldCell v={d} />
                          </td>
                          <td className="py-2">
                            {conflict ? (
                              <div className="flex flex-wrap gap-3 text-xs">
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`scalar-${field}`}
                                    checked={resolution.fields[field] === "target"}
                                    onChange={() =>
                                      setResolution((r) =>
                                        r
                                          ? {
                                              ...r,
                                              fields: { ...r.fields, [field]: "target" },
                                            }
                                          : r,
                                      )
                                    }
                                  />
                                  целевой
                                </label>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`scalar-${field}`}
                                    checked={resolution.fields[field] === "duplicate"}
                                    onChange={() =>
                                      setResolution((r) =>
                                        r
                                          ? {
                                              ...r,
                                              fields: { ...r.fields, [field]: "duplicate" },
                                            }
                                          : r,
                                      )
                                    }
                                  />
                                  дубликат
                                </label>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">авто (без конфликта)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Каналы (telegram / max / vk)</p>
                {(["telegram", "max", "vk"] as const).map((ch) => {
                  const hasCo = preview.channelConflicts.some((c) => c.channelCode === ch);
                  const tb = preview.targetBindings?.find((b) => b.channelCode === ch);
                  const db = preview.duplicateBindings?.find((b) => b.channelCode === ch);
                  return (
                    <div
                      key={ch}
                      className="grid gap-2 rounded-md border border-border/50 p-2 sm:grid-cols-2 lg:grid-cols-4 lg:items-center"
                    >
                      <div className="font-medium text-sm">{CH_LABELS[ch]}</div>
                      <div className="text-xs font-mono break-all">Цел.: {tb?.externalId ?? "—"}</div>
                      <div className="text-xs font-mono break-all">Дубл.: {db?.externalId ?? "—"}</div>
                      <div>
                        {hasCo ? (
                          <div className="flex flex-wrap gap-3 text-xs">
                            {(["target", "duplicate"] as const).map((opt) => (
                              <label key={opt} className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`ch-${ch}`}
                                  checked={resolution.bindings[ch] === opt}
                                  onChange={() =>
                                    setResolution((r) =>
                                      r ? { ...r, bindings: { ...r.bindings, [ch]: opt } } : r,
                                    )
                                  }
                                />
                                {opt === "target" ? "целевой" : "дубликат"}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">авто (both)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {preview.oauthConflicts.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">OAuth конфликты</p>
                  {preview.oauthConflicts.map((o) => (
                    <div
                      key={o.provider}
                      className="flex flex-col gap-2 rounded-md border border-border/50 p-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="text-sm">
                        <span className="font-mono">{o.provider}</span>
                        <span className="block text-xs text-muted-foreground mt-1">
                          цел.: {o.targetProviderUserId ?? "—"} · дубл.: {o.duplicateProviderUserId ?? "—"}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`oauth-${o.provider}`}
                            checked={resolution.oauth[o.provider] === "target"}
                            onChange={() =>
                              setResolution((r) =>
                                r
                                  ? {
                                      ...r,
                                      oauth: { ...r.oauth, [o.provider]: "target" },
                                    }
                                  : r,
                              )
                            }
                          />
                          целевой
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`oauth-${o.provider}`}
                            checked={resolution.oauth[o.provider] === "duplicate"}
                            onChange={() =>
                              setResolution((r) =>
                                r
                                  ? {
                                      ...r,
                                      oauth: { ...r.oauth, [o.provider]: "duplicate" },
                                    }
                                  : r,
                              )
                            }
                          />
                          дубликат
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="merge-ch-prefs">Предпочтения каналов (user_channel_preferences)</Label>
                <select
                  id="merge-ch-prefs"
                  className={cn(
                    "flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                    "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  )}
                  value={resolution.channelPreferences}
                  onChange={(e) =>
                    setResolution((r) =>
                      r
                        ? {
                            ...r,
                            channelPreferences: e.target.value as ManualMergeResolution["channelPreferences"],
                          }
                        : r,
                    )
                  }
                >
                  <option value="keep_newer">keep_newer (как по умолчанию)</option>
                  <option value="keep_target">keep_target (удалить prefs дубликата)</option>
                  <option value="merge">merge</option>
                </select>
              </div>

              <div className="rounded-md bg-muted/40 p-3 text-sm space-y-2">
                <p className="font-medium">Зависимые строки (счётчики)</p>
                <div className="grid gap-2 sm:grid-cols-2 text-xs font-mono">
                  <div>
                    <p className="text-muted-foreground mb-1">Целевой</p>
                    <pre className="overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(preview.dependentCounts.target, null, 0)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Дубликат</p>
                    <pre className="overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(preview.dependentCounts.duplicate, null, 0)}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
                <p className="font-medium">Финальный предпросмотр</p>
                <ul className="list-disc pl-4 space-y-1 text-xs">
                  {summaryLines.map((line, i) => (
                    <li key={`${i}-${line.slice(0, 48)}`}>{line}</li>
                  ))}
                </ul>
                {!preview.mergeAllowed ? (
                  <p className="text-destructive text-xs">mergeAllowed = false (блокировки выше).</p>
                ) : !canMerge ? (
                  <p className="text-xs text-muted-foreground">Проверьте выбор OAuth и соответствие resolution паре.</p>
                ) : (
                  <p className="text-xs text-green-700 dark:text-green-400">Можно подтвердить merge (двойное подтверждение по UUID дубликата).</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || !canMerge}
                  onClick={() => void runMerge()}
                  id="admin-merge-confirm-btn"
                >
                  {busy ? "…" : "Выполнить merge"}
                </Button>
                {!canMerge && preview.mergeAllowed ? (
                  <span className="text-xs text-muted-foreground">Уточните OAuth или поля.</span>
                ) : null}
                {!preview.mergeAllowed ? (
                  <span className="text-xs text-destructive">Кнопка отключена из‑за жёстких блокировок.</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {msg ? (
            <p className="text-sm" role="status">
              {msg}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
