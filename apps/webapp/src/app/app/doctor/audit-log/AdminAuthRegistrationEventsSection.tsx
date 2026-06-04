"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { cn } from "@/lib/utils";
import {
  formatRegistrationAuthMethodLabel,
  formatRegistrationErrorClassLabel,
  formatRegistrationErrorCodeLabel,
  formatRegistrationStageLabel,
  REGISTRATION_AUTH_METHOD_FILTER_OPTIONS,
  REGISTRATION_EVENT_TYPE_FILTER_OPTIONS,
} from "@/modules/auth/registrationEventPresentation";
import type { AuthRegistrationEventType } from "@/modules/product-analytics/types";

type Row = {
  id: string;
  occurredAt: string;
  eventType: AuthRegistrationEventType;
  entryChannel: string;
  userId: string | null;
  metadata: Record<string, unknown>;
};

type ApiOk = {
  ok: true;
  items: Row[];
  total: number;
  page: number;
  limit: number;
};

type Preset = "week" | "month";

function metaStr(row: Row, key: string): string {
  const v = row.metadata[key];
  return typeof v === "string" && v.trim() ? v : "—";
}

function AttemptIdCell({ attemptId }: { attemptId: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(attemptId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (attemptId === "—") return <span>—</span>;

  return (
    <span className="inline-flex items-center gap-1">
      <span className="break-all font-mono text-xs">{attemptId}</span>
      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => void onCopy()}>
        {copied ? "OK" : "Копир."}
      </Button>
    </span>
  );
}

export function AdminAuthRegistrationEventsSection() {
  const [preset, setPreset] = useState<Preset>("week");
  const [eventType, setEventType] = useState<AuthRegistrationEventType | "">("auth_register_failure");
  const [authMethod, setAuthMethod] = useState("");
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiOk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showingSystemFailuresOnly =
    eventType === "auth_register_failure" && !showAllErrors;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        preset,
        page: "1",
        limit: "50",
      });
      if (eventType) params.set("eventType", eventType);
      if (authMethod) params.set("authMethod", authMethod);
      if (showingSystemFailuresOnly) {
        params.set("errorClass", "system");
      }
      const res = await fetch(`/api/admin/auth-registration-events?${params.toString()}`);
      const json = (await res.json()) as ApiOk | { ok: false; error?: string };
      if (!res.ok || !json.ok) {
        setError(!json.ok && "error" in json ? json.error ?? "error" : "error");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("network");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, eventType, authMethod, showingSystemFailuresOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = data?.total ?? 0;
  const presetLabel = preset === "week" ? "за неделю" : "за месяц";
  const showAttentionBanner = showingSystemFailuresOnly && total > 0;

  const emptyMessage = useMemo(() => {
    if (showingSystemFailuresOnly) {
      return `Системных сбоев регистрации ${presetLabel} нет`;
    }
    return "Нет записей";
  }, [presetLabel, showingSystemFailuresOnly]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CardTitle className="text-base">Ошибки регистрации</CardTitle>
          {total > 0 ? (
            <Badge variant={showingSystemFailuresOnly ? "destructive" : "secondary"} className="tabular-nums">
              {total}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Label className="flex items-center gap-2 text-sm font-normal">
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
            >
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </select>
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as AuthRegistrationEventType | "")}
            >
              {REGISTRATION_EVENT_TYPE_FILTER_OPTIONS.map((o) => (
                <option key={o.value || "all-types"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value)}
            >
              {REGISTRATION_AUTH_METHOD_FILTER_OPTIONS.map((o) => (
                <option key={o.value || "all-methods"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Label>
          {eventType === "auth_register_failure" ? (
            <Label className="flex items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                checked={showAllErrors}
                onChange={(e) => setShowAllErrors(e.target.checked)}
              />
              Все ошибки
            </Label>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            Обновить
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {showAttentionBanner ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <span className="font-medium text-destructive">
              {total === 1 ? "1 системный сбой" : `${total} системных сбоев`} {presetLabel}.{" "}
            </span>
            <Link
              href="/app/doctor/audit-log?action=auth_register_failure#admin-audit-log"
              className="text-primary underline underline-offset-2"
            >
              Смотреть в журнале операций
            </Link>
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!data?.items.length && !loading && !error ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Время</th>
                  <th className="py-2 pr-3 font-medium">Метод</th>
                  <th className="py-2 pr-3 font-medium">Этап</th>
                  {eventType === "auth_register_failure" && showAllErrors ? (
                    <th className="py-2 pr-3 font-medium">Тип</th>
                  ) : null}
                  <th className="py-2 pr-3 font-medium">Контакт</th>
                  <th className="py-2 pr-3 font-medium">Код</th>
                  <th className="py-2 font-medium">Попытка</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((row) => {
                  const errorClassRaw = metaStr(row, "errorClass");
                  const isSystemFailure = errorClassRaw === "system";
                  return (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{row.occurredAt.slice(0, 19)}</td>
                      <td className="py-2 pr-3">{formatRegistrationAuthMethodLabel(metaStr(row, "authMethod"))}</td>
                      <td className="py-2 pr-3">{formatRegistrationStageLabel(metaStr(row, "stage"))}</td>
                      {eventType === "auth_register_failure" && showAllErrors ? (
                        <td className="py-2 pr-3">
                          <Badge variant={isSystemFailure ? "destructive" : "secondary"} className="font-normal">
                            {formatRegistrationErrorClassLabel(errorClassRaw)}
                          </Badge>
                        </td>
                      ) : null}
                      <td className="py-2 pr-3">{metaStr(row, "contactHint")}</td>
                      <td
                        className={cn(
                          "py-2 pr-3",
                          row.eventType === "auth_register_failure" && isSystemFailure && "font-medium text-destructive",
                        )}
                      >
                        {formatRegistrationErrorCodeLabel(metaStr(row, "errorCode"))}
                      </td>
                      <td className="py-2">
                        <AttemptIdCell attemptId={metaStr(row, "attemptId")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
