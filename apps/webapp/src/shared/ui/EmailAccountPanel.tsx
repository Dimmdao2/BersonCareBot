"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpCodeForm } from "@/shared/ui/auth/OtpCodeForm";

type Props = {
  initialEmail: string | null;
  emailVerified: boolean;
};

/**
 * Блок привязки / смены email (OTP). Переиспользуется в профиле и на странице уведомлений.
 */
export function EmailAccountPanel({ initialEmail, emailVerified }: Props) {
  const router = useRouter();
  const [emailStep, setEmailStep] = useState<"view" | "enter" | "code">("view");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailChallengeId, setEmailChallengeId] = useState<string | null>(null);
  const [emailRetrySec, setEmailRetrySec] = useState(60);
  const [emailStartError, setEmailStartError] = useState<string | null>(null);

  const refresh = () => {
    router.refresh();
  };

  const startEmail = async () => {
    setEmailStartError(null);
    const res = await fetch("/api/auth/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailDraft.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      challengeId?: string;
      retryAfterSeconds?: number;
      message?: string;
    };
    if (data.ok && data.challengeId) {
      setEmailChallengeId(data.challengeId);
      setEmailRetrySec(data.retryAfterSeconds ?? 60);
      setEmailStep("code");
    } else {
      setEmailStartError(data.message ?? "Не удалось отправить код");
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Email</span>
        {emailStep === "view" ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-primary h-auto min-h-0 px-0 py-0 text-sm font-medium"
            onClick={() => {
              setEmailStep("enter");
              setEmailDraft(initialEmail ?? "");
              setEmailStartError(null);
            }}
          >
            {initialEmail ? "Изменить" : "Добавить"}
          </Button>
        ) : null}
      </div>

      {emailStep === "view" && initialEmail ? (
        <p className="text-sm">
          {initialEmail}
          {emailVerified ? (
            <span className="text-muted-foreground ml-2 text-xs">(подтверждён)</span>
          ) : (
            <span className="text-muted-foreground ml-2 text-xs">(подтверждение по коду)</span>
          )}
        </p>
      ) : null}

      {emailStep === "view" && !initialEmail ? (
        <p className="text-muted-foreground text-sm">не указано — добавьте email для уведомлений.</p>
      ) : null}

      {emailStep === "enter" ? (
        <div className="flex max-w-md flex-col gap-2">
          <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide" htmlFor="email-panel">
            Email
          </label>
          <Input
            id="email-panel"
            type="email"
            autoComplete="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="email@example.com"
          />
          {emailStartError ? <p className="text-destructive text-sm">{emailStartError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void startEmail()}>
              Получить код
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEmailStep("view");
                setEmailChallengeId(null);
                setEmailStartError(null);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {emailStep === "code" && emailChallengeId ? (
        <OtpCodeForm
          challengeId={emailChallengeId}
          retryAfterSeconds={emailRetrySec}
          description="Код отправлен (в dev смотрите лог сервера). Введите его ниже."
          submitLabel="Подтвердить email"
          onConfirm={async (code) => {
            const res = await fetch("/api/auth/email/confirm", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ challengeId: emailChallengeId, code }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              message?: string;
              error?: string;
              retryAfterSeconds?: number;
            };
            if (data.ok) {
              setEmailStep("view");
              setEmailChallengeId(null);
              refresh();
              return { ok: true as const };
            }
            return {
              ok: false as const,
              message: data.message ?? "Ошибка",
              code: data.error,
              retryAfterSeconds: data.retryAfterSeconds,
            };
          }}
          onResend={async () => {
            const res = await fetch("/api/auth/email/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email: emailDraft.trim() }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              challengeId?: string;
              retryAfterSeconds?: number;
            };
            if (data.ok && data.challengeId) {
              setEmailChallengeId(data.challengeId);
              setEmailRetrySec(data.retryAfterSeconds ?? 60);
            }
          }}
          onBack={() => {
            setEmailStep("enter");
            setEmailChallengeId(null);
          }}
        />
      ) : null}
    </div>
  );
}
