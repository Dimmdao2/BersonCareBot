"use client";

/**
 * Публичный поток входа (web): OAuth-first и Telegram Login; телефон — отдельный шаг; экран «Другие способы» без текста про телефон.
 * OTP в вебе — только Telegram / Max (SMS отключён). PIN в этом flow намеренно отключён (Stage 5).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import type { AuthMethodsPayload } from "@/modules/auth/checkPhoneMethods";
import {
  isOtpChannelAvailablePublic,
  OTP_PUBLIC_OTHER_CHANNELS_ORDER,
  pickOtpChannelWithPreferencePublic,
} from "@/modules/auth/otpChannelUi";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { ChannelPicker } from "@/shared/ui/auth/ChannelPicker";
import { OtpCodeForm, type OtpAlternativeEntry, type OtpResendOutcome } from "@/shared/ui/auth/OtpCodeForm";
import { InternationalPhoneInput } from "@/shared/ui/auth/InternationalPhoneInput";
import { TelegramLoginButton } from "@/shared/ui/auth/TelegramLoginButton";
import { SupportContactLink } from "@/shared/ui/SupportContactLink";
import {
  AUTH_LOGIN_OUTLINE_BUTTON_CLASS,
  AUTH_LOGIN_PRIMARY_BUTTON_CLASS,
} from "@/shared/ui/auth/loginChrome";

const WEB_CHAT_ID_KEY = "bersoncare_web_chat_id";

function getWebChatId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(WEB_CHAT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(WEB_CHAT_ID_KEY, id);
  }
  return id;
}

export type AuthFlowStep =
  | "entry_loading"
  | "oauth_first"
  | "other_methods"
  | "landing"
  | "phone"
  | "new_user_foreign"
  | "foreign_no_otp_channel"
  | "choose_channel"
  | "code";

type OtpChannel = "sms" | "telegram" | "max" | "email";

function otpDescription(channel: OtpChannel, emailAddress?: string): string {
  switch (channel) {
    case "telegram":
      return "Введите код, отправленный вам в Telegram.";
    case "max":
      return "Введите код, отправленный вам в Max.";
    case "email":
      return `Введите код, отправленный вам${emailAddress ? ` на ${emailAddress}` : " на email"}.`;
    default:
      return "Введите код, отправленный вам.";
  }
}

function buildAlternatives(
  methods: AuthMethodsPayload,
  currentChannel: OtpChannel,
  onChoose: (ch: OtpChannel) => Promise<OtpResendOutcome>,
): OtpAlternativeEntry[] {
  const result: OtpAlternativeEntry[] = [];
  for (const ch of OTP_PUBLIC_OTHER_CHANNELS_ORDER) {
    if (ch === currentChannel) continue;
    if (!isOtpChannelAvailablePublic(methods, ch)) continue;
    if (ch === "telegram") {
      result.push({
        label: "Получить код в Telegram",
        onClick: async () => {
          await onChoose("telegram");
        },
      });
      continue;
    }
    if (ch === "max") {
      result.push({
        label: "Получить код в Max",
        onClick: async () => {
          await onChoose("max");
        },
      });
      continue;
    }
    result.push({
      label: `Получить код на email${methods.emailAddress ? ` (${methods.emailAddress})` : ""}`,
      onClick: async () => {
        await onChoose("email");
      },
    });
  }
  return result;
}

type AuthFlowV2Props = {
  nextParam: string | null;
  supportContactHref?: string;
  onStepChange?: (step: AuthFlowStep) => void;
};

type OauthProviderFlags = { yandex: boolean; google: boolean; apple: boolean };

type OtherLoginAlternativesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; maxBotOpenUrl: string | null; vkWebLoginUrl: string | null };

export function AuthFlowV2({ nextParam, supportContactHref, onStepChange }: AuthFlowV2Props) {
  const router = useRouter();
  const [step, setStep] = useState<AuthFlowStep>("entry_loading");
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
  /** После ответа /api/auth/telegram-login/config (или сразу в Mini App). До этого показываем слот кнопки Telegram. */
  const [telegramLoginConfigLoaded, setTelegramLoginConfigLoaded] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<OauthProviderFlags>({
    yandex: false,
    google: false,
    apple: false,
  });
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [methods, setMethods] = useState<AuthMethodsPayload | null>(null);
  const [exists, setExists] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [smsStartCooldownSec, setSmsStartCooldownSec] = useState(0);
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("telegram");
  const [otpEntrySource, setOtpEntrySource] = useState<"registration" | "channel" | "auto" | null>(null);
  const [otherAlternatives, setOtherAlternatives] = useState<OtherLoginAlternativesState>({ status: "idle" });

  useEffect(() => {
    if (smsStartCooldownSec <= 0) return;
    const t = window.setTimeout(() => setSmsStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [smsStartCooldownSec]);

  useEffect(() => {
    let cancelled = false;
    if (isMessengerMiniAppHost()) {
      setTelegramBotUsername(null);
      setTelegramLoginConfigLoaded(true);
      setOauthProviders({ yandex: false, google: false, apple: false });
      setStep("phone");
      return () => {
        cancelled = true;
      };
    }

    const emptyOauth: OauthProviderFlags = { yandex: false, google: false, apple: false };
    let oauthResolved = false;
    let tgResolved = false;
    let oauthOp = emptyOauth;
    let tgUsername: string | null = null;

    const finishNonOauthStep = () => {
      if (cancelled || !oauthResolved || !tgResolved) return;
      const oauthOn = oauthOp.yandex || oauthOp.google || oauthOp.apple;
      if (oauthOn) return;
      setStep(tgUsername && tgUsername.length > 0 ? "landing" : "phone");
    };

    void fetch("/api/auth/oauth/providers")
      .then((r) => r.json().catch(() => ({})))
      .then((oauthData) => {
        if (cancelled) return;
        const d = oauthData as { ok?: boolean; yandex?: boolean; google?: boolean; apple?: boolean };
        oauthOp =
          d?.ok === true
            ? {
                yandex: Boolean(d.yandex),
                google: Boolean(d.google),
                apple: Boolean(d.apple),
              }
            : emptyOauth;
        setOauthProviders(oauthOp);
        oauthResolved = true;
        if (oauthOp.yandex || oauthOp.google || oauthOp.apple) {
          setStep("oauth_first");
        }
        finishNonOauthStep();
      })
      .catch(() => {
        if (cancelled) return;
        oauthOp = emptyOauth;
        setOauthProviders(emptyOauth);
        oauthResolved = true;
        finishNonOauthStep();
      });

    void fetch("/api/auth/telegram-login/config")
      .then((r) => r.json().catch(() => ({})))
      .then((tgData) => {
        if (cancelled) return;
        const u = typeof (tgData as { botUsername?: string | null }).botUsername === "string"
          ? String((tgData as { botUsername?: string | null }).botUsername).trim()
          : "";
        tgUsername = u.length > 0 ? u : null;
        setTelegramBotUsername(tgUsername);
        setTelegramLoginConfigLoaded(true);
        tgResolved = true;
        finishNonOauthStep();
      })
      .catch(() => {
        if (cancelled) return;
        tgUsername = null;
        setTelegramBotUsername(null);
        setTelegramLoginConfigLoaded(true);
        tgResolved = true;
        finishNonOauthStep();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "other_methods") return;
    let cancelled = false;
    /** Не сбрасывать в loading при повторном заходе — избегаем мигания; фоновый refetch обновит данные. */
    setOtherAlternatives((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    void fetch("/api/auth/login/alternatives-config")
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (cancelled) return;
        const data = d as {
          ok?: boolean;
          maxBotOpenUrl?: unknown;
          vkWebLoginUrl?: unknown;
          telegramBotUsername?: unknown;
        };
        if (data?.ok !== true) {
          setOtherAlternatives({ status: "ready", maxBotOpenUrl: null, vkWebLoginUrl: null });
          return;
        }
        const maxU =
          typeof data.maxBotOpenUrl === "string" && data.maxBotOpenUrl.trim().length > 0
            ? data.maxBotOpenUrl.trim()
            : null;
        const vkU =
          typeof data.vkWebLoginUrl === "string" && data.vkWebLoginUrl.trim().length > 0
            ? data.vkWebLoginUrl.trim()
            : null;
        setOtherAlternatives({ status: "ready", maxBotOpenUrl: maxU, vkWebLoginUrl: vkU });
        const tg =
          typeof data.telegramBotUsername === "string" ? data.telegramBotUsername.trim().replace(/^@/, "") : "";
        if (tg.length > 0) setTelegramBotUsername(tg);
      })
      .catch(() => {
        if (!cancelled) {
          setOtherAlternatives({ status: "ready", maxBotOpenUrl: null, vkWebLoginUrl: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const startOauth = async (provider: "yandex" | "google" | "apple") => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        authUrl?: string;
        message?: string;
        error?: string;
      };
      if (data.ok && data.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      if (res.status === 429 || data.error === "rate_limited") {
        toast.error(data.message ?? "Слишком много попыток. Попробуйте позже.");
        return;
      }
      toast.error(data.message ?? "Провайдер недоступен");
    } finally {
      setLoading(false);
    }
  };

  const showOauthRow =
    oauthProviders.yandex || oauthProviders.google || oauthProviders.apple;

  const telegramWidgetReady =
    telegramLoginConfigLoaded &&
    telegramBotUsername !== null &&
    telegramBotUsername.length > 0;
  /** Пока конфиг грузится — считаем, что Telegram-вход может появиться; после ответа — только если бот задан. */
  const showTelegramAuthSlot = !telegramLoginConfigLoaded || telegramWidgetReady;

  const goBackToEntry = () => {
    setSmsStartCooldownSec(0);
    if (showOauthRow && !isMessengerMiniAppHost()) {
      setStep("oauth_first");
    } else if (telegramBotUsername) {
      setStep("landing");
    } else {
      setStep("phone");
    }
    setPhone(null);
    setMethods(null);
  };

  const redirectOk = (redirectTo: string, role?: "client" | "doctor" | "admin") => {
    const target = getPostAuthRedirectTarget(role ?? "client", nextParam, redirectTo);
    router.replace(target);
  };

  const startPhoneOtp = async (
    deliveryChannel: OtpChannel,
    entry: "registration" | "channel" | "auto",
    phoneForRequest?: string | null,
  ): Promise<OtpResendOutcome> => {
    const effectivePhone = phoneForRequest ?? phone;
    if (!effectivePhone) return { kind: "error", message: "Нет номера телефона" };
    setLoading(true);
    try {
      const chatId = getWebChatId();
      const res = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone, channel: "web", chatId, deliveryChannel }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.challengeId) {
        if (res.status === 429 || data.error === "rate_limited") {
          const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
          setSmsStartCooldownSec(sec);
          return { kind: "rate_limited", retryAfterSeconds: sec };
        }
        const message = data.message ?? "Не удалось отправить код";
        toast.error(message);
        return { kind: "error", message };
      }
      setSmsStartCooldownSec(0);
      setChallengeId(data.challengeId);
      setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
      setOtpChannel(deliveryChannel);
      setOtpEntrySource(entry);
      setStep("code");
      return { kind: "ok" };
    } finally {
      setLoading(false);
    }
  };

  const runCheckPhone = async (normalized: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/check-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        exists?: boolean;
        methods?: AuthMethodsPayload;
        preferredOtpChannel?: OtpChannel | null;
      };
      if (!res.ok || !data.ok || !data.methods) {
        toast.error("Не удалось проверить номер");
        return;
      }
      setPhone(normalized);
      setExists(Boolean(data.exists));
      setMethods(data.methods);
      if (!data.exists) {
        const hasMessenger =
          isOtpChannelAvailablePublic(data.methods, "telegram") ||
          isOtpChannelAvailablePublic(data.methods, "max");
        setStep(hasMessenger ? "choose_channel" : "new_user_foreign");
      } else {
        const primary = pickOtpChannelWithPreferencePublic(data.methods, data.preferredOtpChannel);
        const hasPublicChannel =
          isOtpChannelAvailablePublic(data.methods, "telegram") ||
          isOtpChannelAvailablePublic(data.methods, "max");
        if (primary == null) {
          setStep(hasPublicChannel ? "choose_channel" : "foreign_no_otp_channel");
        } else {
          const outcome = await startPhoneOtp(primary, "auto", normalized);
          if (outcome.kind !== "ok") {
            setStep("choose_channel");
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (step === "entry_loading") {
    return (
      <div id="auth-flow-v2-entry-loading" className="py-6 text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (step === "oauth_first") {
    return (
      <div id="auth-flow-v2-oauth-first" className="flex flex-col items-center gap-5 px-4 py-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Вход</p>
        <p className="text-muted-foreground text-sm max-w-sm">
          Войдите через Яндекс, Google или Apple либо через бота в Telegram.
        </p>
        <div className="flex w-full flex-col items-center gap-4">
          {oauthProviders.yandex ? (
            <Button
              type="button"
              variant="default"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startOauth("yandex")}
            >
              Войти через Яндекс
            </Button>
          ) : null}
          {oauthProviders.google ? (
            <Button
              type="button"
              variant="default"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startOauth("google")}
            >
              Войти через Google
            </Button>
          ) : null}
          {oauthProviders.apple ? (
            <Button
              type="button"
              variant="default"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startOauth("apple")}
            >
              Войти через Apple
            </Button>
          ) : null}
        </div>
        {showTelegramAuthSlot ? (
          <div className="flex w-full flex-col items-center gap-4">
            {telegramWidgetReady && telegramBotUsername ? (
              <TelegramLoginButton botUsername={telegramBotUsername} nextParam={nextParam} disabled={loading} />
            ) : (
              <Button
                type="button"
                variant="default"
                className={cn(AUTH_LOGIN_PRIMARY_BUTTON_CLASS, "animate-pulse")}
                disabled
                aria-busy="true"
              >
                Войти через Telegram…
              </Button>
            )}
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-0 py-2 text-sm font-normal text-muted-foreground hover:text-foreground"
          disabled={loading}
          onClick={() => setStep("other_methods")}
        >
          Другие способы входа
        </Button>
      </div>
    );
  }

  if (step === "other_methods") {
    const altReady = otherAlternatives.status === "ready";
    const maxOpenUrl = altReady ? otherAlternatives.maxBotOpenUrl : null;
    const vkOpenUrl = altReady ? otherAlternatives.vkWebLoginUrl : null;
    /** `idle` до первого commit useEffect — не показывать «не настроено» до запроса. */
    const altLoading =
      otherAlternatives.status === "loading" || otherAlternatives.status === "idle";

    return (
      <div id="auth-flow-v2-other-methods" className="flex flex-col gap-5 px-4 py-3 text-center">
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-0 self-center px-2 py-1 text-sm font-normal text-muted-foreground hover:text-foreground"
          disabled={loading}
          onClick={() => {
            if (showOauthRow && !isMessengerMiniAppHost()) {
              setStep("oauth_first");
            } else if (telegramBotUsername) {
              setStep("landing");
            } else {
              setStep("phone");
            }
          }}
        >
          ← К основным способам
        </Button>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Другие способы входа</p>
          <p className="mt-2 text-muted-foreground text-sm text-balance">
            Вход через ботов в Telegram и Max, с VK ID или по номеру телефона. Яндекс, Google и Apple — на основном
            экране.
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Вход через бота</p>
          {showTelegramAuthSlot ? (
            <div className="flex w-full flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground">Telegram</span>
              {telegramWidgetReady && telegramBotUsername ? (
                <TelegramLoginButton botUsername={telegramBotUsername} nextParam={nextParam} disabled={loading} />
              ) : (
                <Button
                  type="button"
                  variant="default"
                  className={cn(AUTH_LOGIN_PRIMARY_BUTTON_CLASS, "animate-pulse")}
                  disabled
                  aria-busy="true"
                >
                  Войти через Telegram…
                </Button>
              )}
            </div>
          ) : null}
          <div className="flex w-full flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground">Max</span>
            {altLoading ? (
              <Button
                type="button"
                variant="default"
                className={cn(AUTH_LOGIN_PRIMARY_BUTTON_CLASS, "animate-pulse")}
                disabled
                aria-busy="true"
              >
                Открыть бота в Max…
              </Button>
            ) : maxOpenUrl ? (
              <a
                href={maxOpenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "default" }), AUTH_LOGIN_PRIMARY_BUTTON_CLASS)}
              >
                Открыть бота в Max
              </a>
            ) : (
              <p className="text-xs text-muted-foreground max-w-sm text-balance">
                Ссылка на бота Max не настроена (ник в настройках администратора).
              </p>
            )}
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">VK ID</p>
          {altLoading ? (
            <Button
              type="button"
              variant="outline"
              className={cn(AUTH_LOGIN_OUTLINE_BUTTON_CLASS, "animate-pulse")}
              disabled
              aria-busy="true"
            >
              Войти с VK ID…
            </Button>
          ) : vkOpenUrl ? (
            <a
              href={vkOpenUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), AUTH_LOGIN_OUTLINE_BUTTON_CLASS)}
            >
              Войти с VK ID
            </a>
          ) : (
            <p className="text-xs text-muted-foreground max-w-sm text-balance">
              Ссылка VK ID не задана в настройках администратора.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 text-sm text-muted-foreground"
          disabled={loading}
          onClick={() => setStep("phone")}
        >
          Войти по номеру телефона
        </Button>
      </div>
    );
  }

  if (step === "landing" && telegramBotUsername) {
    return (
      <div id="auth-flow-v2-landing" className="flex flex-col items-center gap-5 px-4 py-3 text-center">
        <TelegramLoginButton botUsername={telegramBotUsername} nextParam={nextParam} disabled={loading} />
        {showOauthRow ? (
          <div className="flex w-full flex-col items-center gap-4">
            {oauthProviders.yandex ? (
              <Button
                type="button"
                variant="default"
                className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth("yandex")}
              >
                Войти через Яндекс
              </Button>
            ) : null}
            {oauthProviders.google ? (
              <Button
                type="button"
                variant="default"
                className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth("google")}
              >
                Войти через Google
              </Button>
            ) : null}
            {oauthProviders.apple ? (
              <Button
                type="button"
                variant="default"
                className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth("apple")}
              >
                Войти через Apple
              </Button>
            ) : null}
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-0 py-2 text-sm font-normal text-muted-foreground hover:text-foreground"
          disabled={loading}
          onClick={() => setStep("other_methods")}
        >
          Другие способы входа
        </Button>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <div id="auth-flow-v2-phone" className="flex flex-col items-center gap-4 py-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Вход</p>
        <p className="text-muted-foreground max-w-sm text-sm text-balance">
          Для входа или регистрации в приложении укажите номер телефона
        </p>
        {showOauthRow ? (
          <>
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-0 px-0 py-0 text-sm font-normal text-muted-foreground"
              onClick={() => setStep("oauth_first")}
            >
              Соцсети и Telegram
            </Button>
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">Вход без номера</p>
              <div className="flex flex-col items-center gap-2">
                {oauthProviders.yandex ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                    disabled={loading}
                    onClick={() => void startOauth("yandex")}
                  >
                    Яндекс
                  </Button>
                ) : null}
                {oauthProviders.google ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                    disabled={loading}
                    onClick={() => void startOauth("google")}
                  >
                    Google
                  </Button>
                ) : null}
                {oauthProviders.apple ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                    disabled={loading}
                    onClick={() => void startOauth("apple")}
                  >
                    Apple
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
        <InternationalPhoneInput disabled={loading} onSubmit={runCheckPhone} submitLabel="Продолжить" />
        {showTelegramAuthSlot ? (
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-0 px-0 py-0 text-sm font-normal text-muted-foreground disabled:opacity-60"
            disabled={loading || !telegramWidgetReady}
            onClick={() => telegramWidgetReady && setStep("landing")}
          >
            {telegramLoginConfigLoaded ? "Войти через Telegram" : "Войти через Telegram…"}
          </Button>
        ) : null}
      </div>
    );
  }

  if (step === "new_user_foreign" && methods) {
    return (
      <div id="auth-flow-v2-new-user-foreign" className="flex flex-col items-center gap-3 py-3 text-center">
        <p className="text-muted-foreground max-w-sm text-sm text-balance">
          В браузере код подтверждения отправляется только в Telegram или Max, привязанные к номеру. SMS для входа с сайта
          отключён.
          {showOauthRow
            ? " Войдите через Яндекс, Google или Apple или укажите другой номер."
            : showTelegramAuthSlot
              ? " Воспользуйтесь входом через Telegram ниже."
              : ""}
        </p>
        {showOauthRow ? (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">Вход без номера</p>
            <div className="flex flex-col items-center gap-2">
              {oauthProviders.yandex ? (
                <Button
                  type="button"
                  variant="outline"
                  className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                  disabled={loading}
                  onClick={() => void startOauth("yandex")}
                >
                  Яндекс
                </Button>
              ) : null}
              {oauthProviders.google ? (
                <Button
                  type="button"
                  variant="outline"
                  className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                  disabled={loading}
                  onClick={() => void startOauth("google")}
                >
                  Google
                </Button>
              ) : null}
              {oauthProviders.apple ? (
                <Button
                  type="button"
                  variant="outline"
                  className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                  disabled={loading}
                  onClick={() => void startOauth("apple")}
                >
                  Apple
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {showTelegramAuthSlot ? (
          <Button
            type="button"
            variant="default"
            className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
            disabled={loading || !telegramWidgetReady}
            onClick={() => telegramWidgetReady && setStep("landing")}
          >
            {telegramLoginConfigLoaded ? "Войти через Telegram" : "Войти через Telegram…"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
          onClick={() => {
            goBackToEntry();
          }}
        >
          Изменить номер
        </Button>
      </div>
    );
  }

  if (step === "foreign_no_otp_channel" && methods) {
    return (
      <div id="auth-flow-v2-foreign-no-otp" className="flex flex-col items-center gap-3 py-3 text-center">
        <p className="text-muted-foreground max-w-sm text-sm text-balance">
          Для этого номера в браузере нет способа получить код: нужны Telegram или Max, привязанные к аккаунту. SMS для
          входа с сайта отключён.
          {showOauthRow
            ? " Воспользуйтесь входом без номера (Яндекс, Google, Apple) — кнопки ниже."
            : showTelegramAuthSlot
              ? " Войдите через Telegram."
              : ""}
          {supportContactHref ? " При необходимости обратитесь в поддержку." : ""}
        </p>
        {showOauthRow ? (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">Вход без номера</p>
            <div className="flex flex-col items-center gap-2">
              {oauthProviders.yandex ? (
                <Button
                  type="button"
                  variant="outline"
                  className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                  disabled={loading}
                  onClick={() => void startOauth("yandex")}
                >
                  Яндекс
                </Button>
              ) : null}
              {oauthProviders.google ? (
                <Button
                  type="button"
                  variant="outline"
                  className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                  disabled={loading}
                  onClick={() => void startOauth("google")}
                >
                  Google
                </Button>
              ) : null}
              {oauthProviders.apple ? (
                <Button
                  type="button"
                  variant="outline"
                  className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                  disabled={loading}
                  onClick={() => void startOauth("apple")}
                >
                  Apple
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {showTelegramAuthSlot ? (
          <Button
            type="button"
            variant="default"
            className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
            disabled={loading || !telegramWidgetReady}
            onClick={() => telegramWidgetReady && setStep("landing")}
          >
            {telegramLoginConfigLoaded ? "Войти через Telegram" : "Войти через Telegram…"}
          </Button>
        ) : null}
        {supportContactHref ? (
          <SupportContactLink
            href={supportContactHref}
            className={cn(
              buttonVariants({ variant: "outline" }),
              AUTH_LOGIN_OUTLINE_BUTTON_CLASS,
              "inline-flex items-center justify-center",
            )}
          >
            Связаться с поддержкой
          </SupportContactLink>
        ) : null}
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
          onClick={() => {
            goBackToEntry();
          }}
        >
          Другой номер
        </Button>
      </div>
    );
  }

  if (step === "choose_channel" && methods) {
    return (
      <div id="auth-flow-v2-channel" className="flex flex-col gap-3">
        {smsStartCooldownSec > 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            Повторная отправка возможна через {smsStartCooldownSec} сек
          </p>
        ) : null}
        <ChannelPicker methods={methods} disabled={loading} onChoose={(ch) => void startPhoneOtp(ch, "channel")} />
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
          onClick={() => {
            goBackToEntry();
          }}
        >
          Другой номер
        </Button>
      </div>
    );
  }

  if (step === "code" && challengeId && methods) {
    const alternatives = buildAlternatives(methods, otpChannel, (ch) => startPhoneOtp(ch, "channel"));

    return (
      <div id="auth-flow-v2-code" className="flex flex-col gap-3">
        <OtpCodeForm
          challengeId={challengeId}
          retryAfterSeconds={retryAfterSeconds}
          supportContactHref={supportContactHref}
          submitLabel="Войти"
          description={otpDescription(otpChannel, methods.emailAddress)}
          alternatives={alternatives}
          onConfirm={async (code) => {
            const chatId = getWebChatId();
            const res = await fetch("/api/auth/phone/confirm", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ challengeId, code, channel: "web", chatId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              redirectTo?: string;
              role?: "client" | "doctor" | "admin";
              message?: string;
              error?: string;
              retryAfterSeconds?: number;
            };
            if (data.ok && data.redirectTo) {
              redirectOk(data.redirectTo, data.role);
              return { ok: true as const, redirectTo: data.redirectTo };
            }
            if (data.error === "rate_limited" && data.retryAfterSeconds != null) {
              return {
                ok: false as const,
                message: "",
                code: "rate_limited",
                retryAfterSeconds: data.retryAfterSeconds,
              };
            }
            return { ok: false as const, message: data.message ?? "Ошибка входа" };
          }}
          onResend={async () => {
            if (!phone) return { kind: "error" as const, message: "Нет номера" };
            const chatId = getWebChatId();
            const res = await fetch("/api/auth/phone/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                phone,
                channel: "web",
                chatId,
                deliveryChannel: otpChannel,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              challengeId?: string;
              retryAfterSeconds?: number;
              error?: string;
              message?: string;
            };
            if (data.ok && data.challengeId) {
              setChallengeId(data.challengeId);
              setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
              return { kind: "ok" as const };
            }
            if (res.status === 429 || data.error === "rate_limited") {
              const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
              setRetryAfterSeconds(sec);
              return { kind: "rate_limited" as const, retryAfterSeconds: sec };
            }
            return { kind: "error" as const, message: data.message ?? "Не удалось отправить код" };
          }}
          onBack={() => {
            const hasMessenger =
              isOtpChannelAvailablePublic(methods, "telegram") ||
              isOtpChannelAvailablePublic(methods, "max");
            if (exists || hasMessenger) {
              setStep("choose_channel");
            } else {
              setStep("new_user_foreign");
            }
          }}
        />
      </div>
    );
  }

  return null;
}
