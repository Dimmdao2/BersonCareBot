/**
 * Admin manual merge UI: second user from overlap list or global search; optional fixed canonical side;
 * merge-preview uses AbortSignal + monotonic request id so out-of-order responses never overwrite state.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ManualMergeResolution } from "@/infra/repos/manualMergeResolution";
import {
  buildDefaultManualMergeResolution,
  canSubmitManualMerge,
  hardBlockerUi,
  resolveMergePreviewAlignment,
  duplicateUuidFirstFourHex,
  mergeDuplicatePrefixConfirmed,
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

type MergeSearchRow = {
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
  /** When true, do not fetch merge-candidates until expanded (e.g. accordion). */
  suspendHeavyFetch?: boolean;
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

export function AdminMergeAccountsPanel({ anchorUserId, enabled, suspendHeavyFetch = false }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<CandidateRow[] | null>(null);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState<string | null>(null);

  const [secondUserId, setSecondUserId] = useState<string>("");
  const [canonicalIsAnchor, setCanonicalIsAnchor] = useState(true);
  const [alignToRecommendation, setAlignToRecommendation] = useState(true);
  const [mergeSearchQ, setMergeSearchQ] = useState("");
  const [mergeSearchResults, setMergeSearchResults] = useState<MergeSearchRow[]>([]);
  const [mergeSearchLoading, setMergeSearchLoading] = useState(false);
  const [mergeSearchError, setMergeSearchError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MergePreviewApiOk | null>(null);
  const [resolution, setResolution] = useState<ManualMergeResolution | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [integratorBusy, setIntegratorBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const mergeCandidatesFetchRef = useRef<AbortController | null>(null);
  /** Serializes merge-preview fetches; incremented on each new request so stale responses are ignored. */
  const mergePreviewRequestIdRef = useRef(0);
  const mergePreviewAbortRef = useRef<AbortController | null>(null);

  const loadCandidates = useCallback(async () => {
    mergeCandidatesFetchRef.current?.abort();
    const ac = new AbortController();
    mergeCandidatesFetchRef.current = ac;

    setCandLoading(true);
    setCandError(null);
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(anchorUserId)}/merge-candidates${qs}`,
        { credentials: "include", signal: ac.signal },
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") {
        return;
      }
      setCandError("network");
      setCandidates(null);
    } finally {
      if (mergeCandidatesFetchRef.current === ac) {
        setCandLoading(false);
        mergeCandidatesFetchRef.current = null;
      }
    }
  }, [anchorUserId, q]);

  useEffect(() => {
    if (!enabled || suspendHeavyFetch) return;
    void loadCandidates();
    return () => {
      mergeCandidatesFetchRef.current?.abort();
    };
  }, [enabled, suspendHeavyFetch, loadCandidates]);

  useEffect(() => {
    if (suspendHeavyFetch) {
      mergeCandidatesFetchRef.current?.abort();
    }
  }, [suspendHeavyFetch]);

  const loadAlignedPreview = useCallback(
    async (opts: {
      targetId: string;
      duplicateId: string;
      secondUserIdForPair: string;
      alignToRecommendation: boolean;
    }) => {
      mergePreviewAbortRef.current?.abort();
      const ac = new AbortController();
      mergePreviewAbortRef.current = ac;
      const requestId = ++mergePreviewRequestIdRef.current;

      setPreviewLoading(true);
      setPreviewError(null);
      const isStale = () => requestId !== mergePreviewRequestIdRef.current;

      try {
        const url = `/api/doctor/clients/merge-preview?targetId=${encodeURIComponent(opts.targetId)}&duplicateId=${encodeURIComponent(opts.duplicateId)}`;
        const res = await fetch(url, { credentials: "include", signal: ac.signal });
        if (isStale()) return;
        const data = (await res.json()) as MergePreviewApiOk | { ok: false; error?: string; message?: string };
        if (!res.ok || !data || (data as MergePreviewApiOk).ok !== true) {
          if (isStale()) return;
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
        const aligned = resolveMergePreviewAlignment(
          opts.alignToRecommendation,
          anchorUserId,
          opts.secondUserIdForPair,
          ok,
        );
        if (aligned.shouldRefetch) {
          const res2 = await fetch(
            `/api/doctor/clients/merge-preview?targetId=${encodeURIComponent(aligned.targetId)}&duplicateId=${encodeURIComponent(aligned.duplicateId)}`,
            { credentials: "include", signal: ac.signal },
          );
          if (isStale()) return;
          const data2 = (await res2.json()) as MergePreviewApiOk | { ok: false };
          if (!res2.ok || !data2 || (data2 as MergePreviewApiOk).ok !== true) {
            if (isStale()) return;
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
          if (isStale()) return;
          setPreview(ok2);
          setResolution(buildDefaultManualMergeResolution(ok2));
          return;
        }
        if (isStale()) return;
        setPreview(ok);
        setResolution(buildDefaultManualMergeResolution(ok));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (isStale()) return;
        setPreviewError("network");
        setPreview(null);
        setResolution(null);
      } finally {
        if (requestId === mergePreviewRequestIdRef.current) {
          setPreviewLoading(false);
        }
      }
    },
    [anchorUserId],
  );

  useEffect(() => {
    if (suspendHeavyFetch) {
      mergePreviewAbortRef.current?.abort();
      mergePreviewAbortRef.current = null;
    }
  }, [suspendHeavyFetch]);

  useEffect(() => {
    if (!secondUserId || !enabled || suspendHeavyFetch || secondUserId === anchorUserId) {
      mergePreviewAbortRef.current?.abort();
      mergePreviewAbortRef.current = null;
      setPreview(null);
      setResolution(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    const targetId = canonicalIsAnchor ? anchorUserId : secondUserId;
    const duplicateId = canonicalIsAnchor ? secondUserId : anchorUserId;
    void loadAlignedPreview({
      targetId,
      duplicateId,
      secondUserIdForPair: secondUserId,
      alignToRecommendation,
    });
  }, [
    anchorUserId,
    secondUserId,
    canonicalIsAnchor,
    alignToRecommendation,
    enabled,
    suspendHeavyFetch,
    loadAlignedPreview,
  ]);

  const mergeUserSearchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled || suspendHeavyFetch) {
      mergeUserSearchAbortRef.current?.abort();
      return;
    }
    const q = mergeSearchQ.trim();
    if (q.length < 2) {
      setMergeSearchResults([]);
      setMergeSearchLoading(false);
      setMergeSearchError(null);
      return;
    }
    setMergeSearchLoading(true);
    setMergeSearchError(null);
    mergeUserSearchAbortRef.current?.abort();
    const ac = new AbortController();
    mergeUserSearchAbortRef.current = ac;
    const tid = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/doctor/clients/merge-user-search?q=${encodeURIComponent(q)}&limit=30`,
            { credentials: "include", signal: ac.signal },
          );
          const data = (await res.json()) as { ok?: boolean; users?: MergeSearchRow[]; error?: string };
          if (mergeUserSearchAbortRef.current !== ac) return;
          if (!res.ok || !data.ok) {
            setMergeSearchResults([]);
            setMergeSearchError(
              res.status === 403
                ? "Нужны роль admin и включённый режим администратора."
                : data.error ?? `Поиск не удался (HTTP ${res.status}).`,
            );
            return;
          }
          setMergeSearchResults(data.users ?? []);
          setMergeSearchError(null);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (mergeUserSearchAbortRef.current !== ac) return;
          setMergeSearchResults([]);
          setMergeSearchError("Сеть недоступна или запрос прерван.");
        } finally {
          if (mergeUserSearchAbortRef.current === ac) {
            setMergeSearchLoading(false);
            mergeUserSearchAbortRef.current = null;
          }
        }
      })();
    }, 350);
    return () => {
      window.clearTimeout(tid);
      ac.abort();
    };
  }, [mergeSearchQ, suspendHeavyFetch, enabled]);

  const canMerge = preview && resolution ? canSubmitManualMerge(preview, resolution) : false;

  const secondUserSelectExtraOption = useMemo(() => {
    if (!secondUserId) return null;
    const inOverlap = (candidates ?? []).some((c) => c.id === secondUserId);
    if (inOverlap) return null;
    const fromSearch = mergeSearchResults.find((u) => u.id === secondUserId);
    const title = fromSearch
      ? `${fromSearch.displayName} (из поиска)`
      : "Выбранная запись (нет в списке пересечений)";
    return { value: secondUserId, label: `${title} · ${secondUserId.slice(0, 8)}…` };
  }, [secondUserId, candidates, mergeSearchResults]);

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

  const needsIntegratorCanonicalStep =
    Boolean(preview?.platformUserMergeV2Enabled) &&
    Boolean(preview?.hardBlockers.some((b) => b.code === "integrator_canonical_merge_required"));

  async function runIntegratorMerge(dryRun: boolean) {
    if (!preview) return;
    setIntegratorBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/doctor/clients/integrator-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetId: preview.targetId,
          duplicateId: preview.duplicateId,
          dryRun,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        result?: unknown;
        dryRun?: boolean;
        duplicateIntegratorUserMissingInIntegrator?: boolean;
        clearedIntegratorUserId?: string;
        orphanIntegratorIdCleared?: boolean;
      };
      if (data.ok === true && data.dryRun === true && data.duplicateIntegratorUserMissingInIntegrator === true) {
        setMsg(
          "Dry-run: у дубликата нет пользователя в integrator (фантомный integrator_user_id). Нажмите «Выполнить integrator merge» без dry-run — привязка дубликата будет сброшена, затем обновите preview и делайте обычный merge.",
        );
        return;
      }
      if (data.ok === true && data.orphanIntegratorIdCleared === true) {
        setMsg(
          `Сброшен фантомный integrator_user_id у дубликата (${data.clearedIntegratorUserId ?? "?" }). Обновлён preview — дальше выполняйте обычный merge в webapp.`,
        );
        await loadAlignedPreview({
          targetId: preview.targetId,
          duplicateId: preview.duplicateId,
          secondUserIdForPair: secondUserId,
          alignToRecommendation,
        });
        return;
      }
      if (!res.ok || !data.ok) {
        setMsg(data.message ?? data.error ?? `integrator_merge_failed (HTTP ${res.status})`);
        return;
      }
      setMsg(dryRun ? "Integrator merge dry-run OK (проверка и блокировки)." : "Canonical merge в integrator выполнен. Обновите preview.");
      await loadAlignedPreview({
        targetId: preview.targetId,
        duplicateId: preview.duplicateId,
        secondUserIdForPair: secondUserId,
        alignToRecommendation,
      });
    } catch {
      setMsg("network");
    } finally {
      setIntegratorBusy(false);
    }
  }

  async function runMerge() {
    if (!preview || !resolution || !canMerge) return;
    if (
      !window.confirm(
        "Объединить учётные записи?\n\n" +
          "Дубликат станет алиасом (merged_into_id), его strong id будут очищены. " +
          "Дальше введите первые 4 hex-символа UUID дубликата (как в подсказке).",
      )
    ) {
      return;
    }
    const prefixHint = duplicateUuidFirstFourHex(preview.duplicateId);
    const typed = window.prompt(
      `Введите первые 4 символа UUID дубликата (hex, без дефисов).\n` +
        `Ожидается начало: ${prefixHint}…\n` +
        `Полный id: ${preview.duplicateId}`,
    );
    if (typed === null) return;
    if (!mergeDuplicatePrefixConfirmed(typed, preview.duplicateId)) {
      setMsg("Первые 4 символа не совпали с UUID дубликата — merge отменён.");
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
      setSecondUserId("");
      setMergeSearchQ("");
      setMergeSearchResults([]);
      setMergeSearchError(null);
      setCanonicalIsAnchor(true);
      setAlignToRecommendation(true);
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
    <div className="flex flex-col gap-3" role="region" aria-labelledby="admin-merge-accounts-heading">
      <h2 id="admin-merge-accounts-heading" className="text-base font-semibold">
        Объединение учётных записей (admin)
      </h2>

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
            <Label htmlFor="merge-dup-select">Вторая запись (из списка пересечений)</Label>
            <select
              id="merge-dup-select"
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
              value={secondUserId}
              onChange={(e) => setSecondUserId(e.target.value)}
            >
              <option value="">— выберите —</option>
              {secondUserSelectExtraOption ? (
                <option value={secondUserSelectExtraOption.value}>{secondUserSelectExtraOption.label}</option>
              ) : null}
              {(candidates ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} · {c.phoneNormalized ?? "нет тел."} · {c.id.slice(0, 8)}…
                </option>
              ))}
            </select>
            {secondUserId ? (
              <p className="text-xs text-muted-foreground font-mono break-all">
                Текущая вторая сторона: {secondUserId}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="merge-user-search-q">Поиск любой второй записи (подстрока)</Label>
            <Input
              id="merge-user-search-q"
              value={mergeSearchQ}
              onChange={(e) => setMergeSearchQ(e.target.value)}
              placeholder="Минимум 2 символа: имя, фамилия, телефон, id…"
              className="font-mono text-sm"
              autoComplete="off"
            />
            {mergeSearchError ? (
              <p className="text-xs text-destructive" role="alert">
                {mergeSearchError}
              </p>
            ) : null}
            {mergeSearchLoading ? (
              <p className="text-xs text-muted-foreground">Поиск…</p>
            ) : mergeSearchResults.length > 0 ? (
              <ul className="m-0 max-h-48 list-none space-y-1 overflow-y-auto rounded-md border border-border/60 p-2 text-sm">
                {mergeSearchResults
                  .filter((u) => u.id !== anchorUserId)
                  .map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full rounded px-2 py-1.5 text-left hover:bg-muted/80",
                          secondUserId === u.id && "bg-muted",
                        )}
                        onClick={() => setSecondUserId(u.id)}
                      >
                        <span className="font-medium">{u.displayName}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{u.id.slice(0, 8)}…</span>
                        <span className="block text-xs text-muted-foreground">{u.phoneNormalized ?? "нет тел."}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            ) : mergeSearchQ.trim().length >= 2 && !mergeSearchError ? (
              <p className="text-xs text-muted-foreground">Ничего не найдено.</p>
            ) : null}
          </div>

          <fieldset className="space-y-2 rounded-md border border-border/50 p-3">
            <legend className="text-sm font-medium px-1">Каноническая запись после merge</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="merge-canonical"
                checked={canonicalIsAnchor}
                onChange={() => setCanonicalIsAnchor(true)}
              />
              Текущая карточка (якорь)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="merge-canonical"
                checked={!canonicalIsAnchor}
                onChange={() => setCanonicalIsAnchor(false)}
                disabled={!secondUserId}
              />
              Вторая выбранная запись
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm pt-1 border-t border-border/40">
              <input
                type="checkbox"
                checked={alignToRecommendation}
                onChange={(e) => setAlignToRecommendation(e.target.checked)}
              />
              Подстроить ориентацию под рекомендацию preview (эвристика)
            </label>
          </fieldset>

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

              {needsIntegratorCanonicalStep ? (
                <div className="rounded-md border border-violet-500/40 bg-violet-500/10 p-3 text-sm space-y-2">
                  <p className="font-medium">Шаг 1 — integrator</p>
                  <p className="text-xs text-muted-foreground">
                    winner <span className="font-mono">{preview.target.integratorUserId}</span> · loser{" "}
                    <span className="font-mono">{preview.duplicate.integratorUserId}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={integratorBusy}
                      onClick={() => void runIntegratorMerge(true)}
                    >
                      {integratorBusy ? "…" : "Dry-run integrator merge"}
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={integratorBusy}
                      onClick={() => void runIntegratorMerge(false)}
                    >
                      {integratorBusy ? "…" : "Выполнить integrator merge"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {preview.mergeAllowed &&
              preview.hardBlockers.length === 0 &&
              !preview.v1MergeEngineCallable ? (
                <p className="text-xs text-muted-foreground" role="note">
                  Авто-merge (v1) для этой пары недоступен; ручной merge с выбранными полями допустим.
                </p>
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

              <div className="rounded-md border border-border/60 bg-muted/25 p-3 text-sm space-y-2">
                <p className="font-medium">Integrator: строка в таблице users</p>
                {preview.integratorUserPresence.checkStatus === "skipped_no_integrator_db" ? (
                  <p className="text-xs text-muted-foreground">
                    Проверка недоступна: в env webapp нет строки подключения к БД integrator (
                    <span className="font-mono">INTEGRATOR_DATABASE_URL</span>,{" "}
                    <span className="font-mono">SOURCE_DATABASE_URL</span> и т.п. — см. purge/backfill).
                  </p>
                ) : null}
                {preview.integratorUserPresence.checkStatus === "query_failed" ? (
                  <p className="text-xs text-destructive" role="note">
                    Запрос к БД integrator не выполнен.
                  </p>
                ) : null}
                <ul className="space-y-1.5 text-xs">
                  <li>
                    <span className="text-muted-foreground">Целевой</span>
                    {preview.integratorUserPresence.target.webappIntegratorUserId ? (
                      <>
                        : id{" "}
                        <span className="font-mono">{preview.integratorUserPresence.target.webappIntegratorUserId}</span>
                        {" — "}
                        {preview.integratorUserPresence.target.rowExistsInIntegratorDb === true
                          ? "в integrator есть"
                          : preview.integratorUserPresence.target.rowExistsInIntegratorDb === false
                            ? "в integrator нет (фантом)"
                            : "неизвестно"}
                      </>
                    ) : (
                      <>: integrator_user_id в webapp нет</>
                    )}
                  </li>
                  <li>
                    <span className="text-muted-foreground">Дубликат</span>
                    {preview.integratorUserPresence.duplicate.webappIntegratorUserId ? (
                      <>
                        : id{" "}
                        <span className="font-mono">
                          {preview.integratorUserPresence.duplicate.webappIntegratorUserId}
                        </span>
                        {" — "}
                        {preview.integratorUserPresence.duplicate.rowExistsInIntegratorDb === true
                          ? "в integrator есть"
                          : preview.integratorUserPresence.duplicate.rowExistsInIntegratorDb === false
                            ? "в integrator нет (фантом)"
                            : "неизвестно"}
                      </>
                    ) : (
                      <>: integrator_user_id в webapp нет</>
                    )}
                  </li>
                </ul>
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
                  <p className="text-xs text-green-700 dark:text-green-400">
                    Можно подтвердить merge (подтверждение — первые 4 hex-символа UUID дубликата).
                  </p>
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
    </div>
  );
}
