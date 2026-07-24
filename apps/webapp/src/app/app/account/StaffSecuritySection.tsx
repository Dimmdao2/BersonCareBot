"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";

type SecurityStatus = {
  enrolled: boolean;
  recoveryConfirmed: boolean;
  replacementRequired: boolean;
  lockedUntil: string | null;
};

type Props = {
  initialStatus: SecurityStatus;
  hasProfileName: boolean;
  hasTimezone: boolean;
  hasOrganization: boolean;
  hasSpecialistBinding: boolean;
  recoveryOnly?: boolean;
};

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return await response.json() as T;
}

export function StaffSecuritySection(props: Props) {
  const [status, setStatus] = useState(props.initialStatus);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const securityReady = status.enrolled && status.recoveryConfirmed && !status.replacementRequired;

  async function refreshStatus() {
    const result = await fetch("/api/account/security/status").then((response) => response.json()) as {
      status?: SecurityStatus;
    };
    if (result.status) setStatus(result.status);
  }

  async function startEnrollment() {
    setBusy(true);
    try {
      const result = await postJson<{ ok: boolean; secret?: string; uri?: string; error?: string }>(
        "/api/account/security/totp/start",
      );
      if (!result.ok || !result.secret || !result.uri) {
        toast.error("Не удалось начать настройку защиты");
        return;
      }
      setSecret(result.secret);
      setUri(result.uri);
      setRecoveryCodes([]);
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment() {
    setBusy(true);
    try {
      const result = await postJson<{ ok: boolean; recoveryCodes?: string[]; error?: string }>(
        "/api/account/security/totp/verify",
        { code },
      );
      if (!result.ok || !result.recoveryCodes) {
        toast.error(result.error === "factor_locked" ? "Слишком много попыток. Повторите позже." : "Неверный код");
        return;
      }
      setCode("");
      setSecret(null);
      setUri(null);
      setRecoveryCodes(result.recoveryCodes);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function confirmRecovery() {
    const result = await postJson<{ ok: boolean }>("/api/account/security/recovery/confirm");
    if (!result.ok) return toast.error("Не удалось подтвердить сохранение кодов");
    setRecoveryCodes([]);
    window.location.assign("/app/account?tab=security");
  }

  async function bindSpecialist() {
    const result = await postJson<{ ok: boolean; redirectTo?: string; error?: string }>(
      "/api/account/first-run/bind-specialist",
    );
    if (!result.ok) return toast.error("Сначала завершите настройку защиты аккаунта");
    window.location.assign(result.redirectTo ?? "/app/doctor");
  }

  async function retryProvisioning() {
    const result = await postJson<{ ok: boolean; redirectTo?: string }>("/api/auth/specialist-signup/retry");
    if (!result.ok) return toast.error("Аккаунт ещё не готов. Повторите позже.");
    window.location.assign(result.redirectTo ?? "/app/account?tab=security");
  }

  async function revokeSessions() {
    const result = await postJson<{ ok: boolean }>("/api/account/security/sessions/revoke");
    if (!result.ok) return toast.error("Не удалось завершить другие сеансы");
    toast.success("Другие сеансы завершены");
  }

  return (
    <div className="flex flex-col gap-3">
      {!props.recoveryOnly ? <DoctorSection>
        <DoctorSectionHeader><DoctorSectionTitle>Первый запуск</DoctorSectionTitle></DoctorSectionHeader>
        <ul className="space-y-2 text-sm">
          <li>{props.hasProfileName ? "✓" : "○"} Профиль специалиста</li>
          <li>{props.hasTimezone ? "✓" : "○"} Часовой пояс</li>
          <li>{props.hasOrganization ? "✓" : "○"} Кабинет создан</li>
          <li>{securityReady ? "✓" : "○"} Двухфакторная защита и резервные коды</li>
          <li>{props.hasSpecialistBinding ? "✓" : "○"} Рабочий кабинет специалиста</li>
          <li>{props.hasSpecialistBinding ? "○" : "—"} Услуга, место и доступность для записи</li>
          <li>{props.hasSpecialistBinding ? "○" : "—"} Готовность пригласить первого пациента</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="text-sm underline" href="/app/account">Профиль и часовой пояс</Link>
          {!props.hasOrganization ? <Button size="sm" variant="outline" onClick={retryProvisioning}>Повторить настройку аккаунта</Button> : null}
          {props.hasSpecialistBinding ? (
            <Link className="text-sm underline" href="/app/doctor/schedule?tab=setup">Настроить запись</Link>
          ) : null}
        </div>
        {/* Desktop hides DoctorHeader/DoctorAdminSidebar (no clinical/org capability yet) while this
            checklist is incomplete, so a stuck first-run account otherwise has no way to sign out. */}
        <form action="/api/auth/logout" method="post" className="mt-2">
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15"
          >
            Выйти
          </Button>
        </form>
      </DoctorSection> : null}

      <DoctorSection>
        <DoctorSectionHeader><DoctorSectionTitle>Защита аккаунта</DoctorSectionTitle></DoctorSectionHeader>
        {securityReady ? <p className="text-sm">Приложение-аутентификатор подключено, резервные коды сохранены.</p> : null}
        {status.replacementRequired ? <p className="text-sm text-destructive">Вход выполнен резервным кодом. Подключите фактор заново.</p> : null}
        {!secret && (!securityReady || status.replacementRequired) ? (
          <Button size="sm" disabled={busy} onClick={startEnrollment}>Подключить приложение-аутентификатор</Button>
        ) : null}
        {secret ? (
          <div className="space-y-2 text-sm">
            <p>Добавьте ключ в приложение-аутентификатор:</p>
            <code className="block break-all rounded-md border p-2">{secret}</code>
            <a className="underline" href={uri ?? undefined}>Открыть в приложении</a>
            <div className="flex gap-2">
              <Input aria-label="Код из приложения" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} />
              <Button size="sm" disabled={busy || !/^\d{6}$/u.test(code)} onClick={verifyEnrollment}>Проверить</Button>
            </div>
          </div>
        ) : null}
        {recoveryCodes.length > 0 ? (
          <div className="space-y-2 text-sm">
            <p>Сохраните резервные коды. Каждый код действует один раз.</p>
            <pre className="rounded-md border p-2">{recoveryCodes.join("\n")}</pre>
            <Button size="sm" onClick={confirmRecovery}>Я сохранил коды</Button>
          </div>
        ) : null}
        {securityReady && !props.recoveryOnly ? (
          <div className="flex flex-wrap gap-2">
            {!props.hasSpecialistBinding ? <Button size="sm" onClick={bindSpecialist}>Подключить рабочий кабинет</Button> : null}
            <Button size="sm" variant="outline" onClick={revokeSessions}>Завершить другие сеансы</Button>
          </div>
        ) : null}
      </DoctorSection>
    </div>
  );
}
