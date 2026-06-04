"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import { patchAdminSetting } from "./patchAdminSetting";

export type EmailSmtpSectionProps = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasStoredPassword: boolean;
};

export function EmailSmtpSection({
  host: initialHost,
  port: initialPort,
  secure: initialSecure,
  user: initialUser,
  from: initialFrom,
  hasStoredPassword: _hasStoredPassword,
}: EmailSmtpSectionProps) {
  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(String(initialPort));
  const [secure, setSecure] = useState(initialSecure);
  const [user, setUser] = useState(initialUser);
  const [from, setFrom] = useState(initialFrom);
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [testTo, setTestTo] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [isTestPending, startTestTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const portNum = Number.parseInt(port.trim(), 10);
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
        setError("Порт SMTP: число от 1 до 65535");
        return;
      }
      try {
        const ok = await patchAdminSetting("smtp_outbound", {
          host,
          port: portNum,
          secure,
          user,
          password,
          from,
        });
        if (!ok) {
          setError("Не удалось сохранить");
          return;
        }
        setPassword("");
        setSaved(true);
      } catch {
        setError("Ошибка при сохранении");
      }
    });
  }

  function handleTestSend() {
    setTestOk(false);
    setTestError(null);
    startTestTransition(async () => {
      try {
        const res = await fetch("/api/admin/smtp-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: testTo.trim() }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        if (res.ok) {
          setTestOk(true);
          return;
        }
        if (res.status === 400 && data?.error === "smtp_not_configured") {
          setTestError("Сначала сохраните полный SMTP в БД");
          return;
        }
        if (res.status === 400 && data?.error === "smtp_password_missing") {
          setTestError("В настройках нет пароля SMTP");
          return;
        }
        if (res.status === 400 && data?.error === "invalid_body") {
          setTestError("Укажите корректный email получателя");
          return;
        }
        setTestError(data?.message ?? data?.error ?? "Не удалось отправить");
      } catch {
        setTestError("Ошибка запроса");
      }
    });
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Исходящая почта (SMTP)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Коды подтверждения отправляет интегратор. Пустое поле «Пароль» — не менять сохранённый.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">SMTP host</span>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            placeholder="smtp.example.com"
          />
        </label>
        <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Порт</span>
            <Input
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={isPending}
            />
          </label>
          <LabeledSwitch
            label="TLS (secure)"
            checked={secure}
            onCheckedChange={(v) => setSecure(Boolean(v))}
            disabled={isPending}
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Пользователь</span>
          <Input value={user} onChange={(e) => setUser(e.target.value)} disabled={isPending} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Пароль</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            autoComplete="new-password"
            placeholder={_hasStoredPassword ? "(без изменения — оставьте пустым)" : ""}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">От кого (From)</span>
          <Input
            type="email"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            placeholder="noreply@example.com"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>

        <div className="flex max-w-xl flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end sm:gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-medium">Тест — кому</span>
            <Input
              type="email"
              value={testTo}
              onChange={(e) => {
                setTestTo(e.target.value);
                setTestOk(false);
                setTestError(null);
              }}
              disabled={isTestPending}
              autoComplete="off"
              placeholder="email получателя"
            />
          </label>
          <Button type="button" variant="secondary" onClick={handleTestSend} disabled={isTestPending || !testTo.trim()}>
            {isTestPending ? "Отправка…" : "Отправить тест"}
          </Button>
        </div>
        {testOk && <span className="text-sm text-green-600">Тестовое письмо отправлено</span>}
        {testError && <span className="text-sm text-destructive">{testError}</span>}
      </CardContent>
    </Card>
  );
}
