"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/shared/ui/AppShell";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS,
  AUTH_LOGIN_PRIMARY_BUTTON_CLASS,
} from "@/shared/ui/auth/loginChrome";
import {
  patientCardClass,
  patientInlineLinkClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";

const ALREADY_HAS_LOGIN_MESSAGE = "Доступ по этой почте уже настроен. Войдите с паролем.";

type PageState =
  | { kind: "loading" }
  | { kind: "missing_token" }
  | { kind: "ready"; email: string }
  | { kind: "expired"; email: string }
  | { kind: "error"; message: string }
  | { kind: "resend_sent"; email: string };

type Props = { initialToken: string };

const fieldLabelClass = cn(patientMutedTextClass, "text-sm");

export default function EmailSetupPageClient({ initialToken }: Props) {
  const router = useRouter();
  const [token] = useState(initialToken);
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const validateToken = useCallback(async (setupToken: string) => {
    if (!setupToken) {
      setPageState({ kind: "missing_token" });
      return;
    }
    setPageState({ kind: "loading" });
    const res = await fetch("/api/auth/email-setup/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: setupToken }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      email?: string;
      error?: string;
    };
    if (body.ok && body.email) {
      setPageState({ kind: "ready", email: body.email });
      return;
    }
    if (body.error === "expired" && body.email) {
      setPageState({ kind: "expired", email: body.email });
      return;
    }
    if (body.error === "already_has_login") {
      setPageState({
        kind: "error",
        message: ALREADY_HAS_LOGIN_MESSAGE,
      });
      return;
    }
    if (body.error === "used") {
      setPageState({ kind: "error", message: "Ссылка уже использована." });
      return;
    }
    setPageState({ kind: "error", message: "Ссылка недействительна." });
  }, []);

  useEffect(() => {
    void validateToken(token);
  }, [token, validateToken]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pageState.kind !== "ready") return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/email-setup/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirectTo?: string;
        error?: string;
      };
      if (body.ok && body.redirectTo) {
        router.replace(body.redirectTo);
        return;
      }
      if (body.error === "expired") {
        setPageState({ kind: "expired", email: pageState.email });
        setFormError("Ссылка устарела.");
        return;
      }
      if (body.error === "invalid_password") {
        setFormError("Пароль — не менее 8 символов.");
        return;
      }
      if (body.error === "already_has_login") {
        setFormError(ALREADY_HAS_LOGIN_MESSAGE);
        return;
      }
      setFormError("Не удалось сохранить пароль. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (pageState.kind !== "expired") return;
    setResending(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/email-setup/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (body.ok) {
        setPageState({ kind: "resend_sent", email: pageState.email });
        return;
      }
      if (body.error === "already_has_login") {
        setPageState({
          kind: "error",
          message: ALREADY_HAS_LOGIN_MESSAGE,
        });
        return;
      }
      setFormError("Не удалось отправить письмо. Попробуйте позже.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AppShell
      title="BersonCare"
      user={null}
      variant="patient"
      backHref="/app"
      backLabel="К входу"
      patientHideHome
      patientHideRightIcons
      patientBrandTitleBar
      patientHideBottomNav
    >
      <section id="email-setup-section" className={cn(patientCardClass, "flex flex-col gap-4 pb-24")}>
        {pageState.kind === "loading" ? (
          <p className={patientMutedTextClass}>Проверка ссылки…</p>
        ) : null}

        {pageState.kind === "missing_token" ? (
          <>
            <h2 className={patientSectionTitleClass}>Ссылка не найдена</h2>
            <p className={patientMutedTextClass}>Откройте ссылку из письма или запросите новую у специалиста.</p>
          </>
        ) : null}

        {pageState.kind === "error" ? (
          <>
            <h2 className={patientSectionTitleClass}>Не удалось открыть ссылку</h2>
            <p className={patientMutedTextClass}>{pageState.message}</p>
            <p>
              <Link href="/app" className={cn(patientInlineLinkClass, "text-sm font-medium")}>
                Перейти ко входу
              </Link>
            </p>
          </>
        ) : null}

        {pageState.kind === "ready" ? (
          <>
            <h2 className={patientSectionTitleClass}>Создайте пароль</h2>
            <p className={patientMutedTextClass}>Подтвердите email и задайте пароль для входа в кабинет.</p>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email-setup-email" className={fieldLabelClass}>
                  Email
                </label>
                <Input
                  id="email-setup-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  readOnly
                  value={pageState.email}
                  className="w-full bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email-setup-password" className={fieldLabelClass}>
                  Пароль
                </label>
                <Input
                  id="email-setup-password"
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white"
                />
              </div>
              {formError ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-destructive">{formError}</p>
                  {formError === ALREADY_HAS_LOGIN_MESSAGE ? (
                    <p>
                      <Link href="/app" className={cn(patientInlineLinkClass, "text-sm font-medium")}>
                        Перейти ко входу
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Button
                type="submit"
                disabled={submitting}
                className={cn(AUTH_LOGIN_PRIMARY_BUTTON_CLASS, AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS)}
              >
                {submitting ? "Сохранение…" : "Создать доступ"}
              </Button>
            </form>
          </>
        ) : null}

        {pageState.kind === "expired" || pageState.kind === "resend_sent" ? (
          <>
            <h2 className={patientSectionTitleClass}>
              {pageState.kind === "resend_sent" ? "Письмо отправлено" : "Ссылка устарела"}
            </h2>
            {pageState.kind === "expired" ? (
              <p className={patientMutedTextClass}>
                Отправить новую ссылку на{" "}
                <span className="font-medium text-foreground">{pageState.email}</span>?
              </p>
            ) : (
              <p className={patientMutedTextClass}>
                Новая ссылка отправлена на{" "}
                <span className="font-medium text-foreground">{pageState.email}</span>. Проверьте почту.
              </p>
            )}
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            {pageState.kind === "expired" ? (
              <Button
                type="button"
                disabled={resending}
                onClick={() => void onResend()}
                className={cn(AUTH_LOGIN_PRIMARY_BUTTON_CLASS, AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS)}
              >
                {resending ? "Отправка…" : "Отправить новую ссылку"}
              </Button>
            ) : null}
            <p>
              <Link href="/app" className={cn(patientInlineLinkClass, "text-sm font-medium")}>
                Перейти ко входу
              </Link>
            </p>
          </>
        ) : null}
      </section>
      <LegalFooterLinks className="mt-8" />
    </AppShell>
  );
}
