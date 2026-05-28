"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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

const EVENT_TYPE_OPTIONS: { value: AuthRegistrationEventType | ""; label: string }[] = [
  { value: "auth_register_failure", label: "failure" },
  { value: "auth_register_attempt", label: "attempt" },
  { value: "auth_register_success", label: "success" },
  { value: "", label: "все типы" },
];

const AUTH_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "все методы" },
  { value: "email_password", label: "email_password" },
  { value: "oauth_yandex", label: "oauth_yandex" },
  { value: "oauth_google", label: "oauth_google" },
  { value: "oauth_apple", label: "oauth_apple" },
  { value: "phone_otp", label: "phone_otp" },
  { value: "messenger_bind", label: "messenger_bind" },
  { value: "telegram_init", label: "telegram_init" },
  { value: "max_init", label: "max_init" },
  { value: "integrator_exchange", label: "integrator_exchange" },
];

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
      <span className="font-mono text-xs break-all">{attemptId}</span>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => void onCopy()}>
        {copied ? "ok" : "copy"}
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
      if (eventType === "auth_register_failure" && !showAllErrors) {
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
  }, [preset, eventType, authMethod, showAllErrors]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="mt-8">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Ошибки регистрации</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Label className="flex items-center gap-2 text-sm font-normal">
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
            >
              <option value="week">неделя</option>
              <option value="month">месяц</option>
            </select>
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as AuthRegistrationEventType | "")}
            >
              {EVENT_TYPE_OPTIONS.map((o) => (
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
              {AUTH_METHOD_OPTIONS.map((o) => (
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
              все ошибки
            </Label>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            Обновить
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!data?.items.length && !loading && !error ? (
          <p className="text-sm text-muted-foreground">Нет записей</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Время</th>
                  <th className="py-2 pr-3 font-medium">Метод</th>
                  <th className="py-2 pr-3 font-medium">Этап</th>
                  <th className="py-2 pr-3 font-medium">Контакт</th>
                  <th className="py-2 pr-3 font-medium">Код</th>
                  <th className="py-2 font-medium">attemptId</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{row.occurredAt.slice(0, 19)}</td>
                    <td className="py-2 pr-3">{metaStr(row, "authMethod")}</td>
                    <td className="py-2 pr-3">{metaStr(row, "stage")}</td>
                    <td className="py-2 pr-3">{metaStr(row, "contactHint")}</td>
                    <td className={cn("py-2 pr-3", row.eventType === "auth_register_failure" && "text-destructive")}>
                      {metaStr(row, "errorCode")}
                    </td>
                    <td className="py-2">
                      <AttemptIdCell attemptId={metaStr(row, "attemptId")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
