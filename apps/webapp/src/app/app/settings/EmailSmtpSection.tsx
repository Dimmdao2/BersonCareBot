"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  hasStoredPassword,
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

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Исходящая почта (SMTP)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Для отправки кодов email (регистрация, сброс пароля); обрабатывается интегратором. Пустое поле пароля —
          сохранить без смены пароля.
          {hasStoredPassword ? (
            <>
              {" "}
              Пароль в БД задан.
            </>
          ) : null}
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
            placeholder={hasStoredPassword ? "(без изменения — оставьте пустым)" : ""}
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

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
