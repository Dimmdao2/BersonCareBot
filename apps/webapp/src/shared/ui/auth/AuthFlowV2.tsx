"use client";

/**
 * Публичный поток входа (web): Яндекс, Google, Telegram, Max; телефон — отдельный шаг.
 * Apple показывается только если включён Apple и при этом выключены Яндекс и Google (резерв для таких деплоев).
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

const SMS_DISABLED_WEB_MESSAGE = "SMS для входа с сайта отключён. Используйте код в Telegram или Max.";

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

function MaxLoginCta({
  maxAltLoading,
  maxOpenUrl,
  variant,
  onActivate,
}: {
  maxAltLoading: boolean;
  maxOpenUrl: string | null;
  variant: "primary" | "outline";
  onActivate?: () => void;
}) {
  const cls = variant === "primary" ? AUTH_LOGIN_PRIMARY_BUTTON_CLASS : AUTH_LOGIN_OUTLINE_BUTTON_CLASS;
  if (maxAltLoading) {
    return (
      <Button
        type="button"
        variant={variant === "primary" ? "default" : "outline"}
        className={cn(cls, "animate-pulse")}
        disabled
        aria-busy="true"
      >
        {variant === "primary" ? "Войти через Max…" : "Max…"}
      </Button>
    );
  }
  if (!maxOpenUrl) return null;
  return (
    <a
      href={maxOpenUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: variant === "primary" ? "default" : "outline" }), cls)}
      onClick={() => onActivate?.()}
    >
      {variant === "primary" ? "Войти через Max" : "Max"}
    </a>
  );
}

type OauthProviderFlags = { yandex: boolean; google: boolean; apple: boolean };

export type PrefetchedPublicAuthConfig = {
  oauthProviders: OauthProviderFlags;
  telegramBotUsername: string | null;
  maxBotOpenUrl: string | null;
  fetchedAt: number;
};

type AuthFlowV2Props = {
  nextParam: string | null;
  supportContactHref?: string;
  onStepChange?: (step: AuthFlowStep) => void;
  /** Сид из `AuthBootstrap` prefetch (публичные конфиги входа). */
  prefetchedAuthConfig?: PrefetchedPublicAuthConfig | null;
  /** Пользователь начал интерактивный вход (OAuth / телефон / код) — не перехватывать UI поздним initData. */
  onInteractiveLoginEngaged?: () => void;
};

type MaxBotOpenUrlState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string | null };

export function AuthFlowV2({
  nextParam,
  supportContactHref,
  onStepChange,
  prefetchedAuthConfig,
  onInteractiveLoginEngaged,
}: AuthFlowV2Props) {
  const router = useRouter();
  const engageInteractive = () => {
    onInteractiveLoginEngaged?.();
  };
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
  const [maxBotOpenUrl, setMaxBotOpenUrl] = useState<MaxBotOpenUrlState>({ status: "idle" });

  useEffect(() => {
    if (smsStartCooldownSec <= 0) return;
    const t = window.setTimeout(() => setSmsStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [smsStartCooldownSec]);

  useEffect(() => {
    if (isMessengerMiniAppHost()) {
      setTelegramBotUsername(null);
      setTelegramLoginConfigLoaded(true);
      setOauthProviders({ yandex: false, google: false, apple: false });
      setMaxBotOpenUrl({ status: "ready", url: null });
      setStep("phone");
      return;
    }

    const oauth = prefetchedAuthConfig?.oauthProviders ?? { yandex: false, google: false, apple: false };
    const tg = (prefetchedAuthConfig?.telegramBotUsername ?? "").trim();
    const maxU = (prefetchedAuthConfig?.maxBotOpenUrl ?? "").trim();
    setOauthProviders(oauth);
    setTelegramBotUsername(tg.length > 0 ? tg : null);
    setTelegramLoginConfigLoaded(true);
    setMaxBotOpenUrl({ status: "ready", url: maxU.length > 0 ? maxU : null });

    const oauthOn = oauth.yandex || oauth.google || oauth.apple;
    setStep(oauthOn ? "oauth_first" : tg.length > 0 ? "landing" : "phone");
  }, [prefetchedAuthConfig]);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const startOauth = async (provider: "yandex" | "google" | "apple") => {
    engageInteractive();
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

  const showOauthRow = oauthProviders.yandex || oauthProviders.google;
  /** Apple в основном ряду только если нет Яндекса и Google — иначе основной набор провайдеров без Apple (продуктовое правило). */
  const showAppleFallback =
    oauthProviders.apple && !oauthProviders.yandex && !oauthProviders.google;
  const hasWebOauthAlternatives = showOauthRow || showAppleFallback;

  const maxAltLoading = maxBotOpenUrl.status === "loading" || maxBotOpenUrl.status === "idle";
  const maxOpenUrl = maxBotOpenUrl.status === "ready" ? maxBotOpenUrl.url : null;

  const oauthEntrySubtitle = (() => {
    const parts: string[] = [];
    if (oauthProviders.yandex) parts.push("Яндекс");
    if (oauthProviders.google) parts.push("Google");
    if (showAppleFallback) parts.push("Apple");
    if (parts.length === 0) return "Войдите через Telegram или Max.";
    return `Войдите через ${parts.join(", ")}, Telegram или Max.`;
  })();

  /** Подпись к компактному ряду на шаге телефона (без Telegram — он отдельной ссылкой ниже). Max — только если есть загрузка или ссылка. */
  const phoneOauthCompactCaption = (() => {
    const bits: string[] = [];
    if (oauthProviders.yandex) bits.push("Яндекс");
    if (oauthProviders.google) bits.push("Google");
    if (showAppleFallback) bits.push("Apple");
    if (maxAltLoading || maxOpenUrl) bits.push("Max");
    return bits.join(", ");
  })();

  const telegramWidgetReady =
    telegramLoginConfigLoaded &&
    telegramBotUsername !== null &&
    telegramBotUsername.length > 0;
  /** Пока конфиг грузится — считаем, что Telegram-вход может появиться; после ответа — только если бот задан. */
  const showTelegramAuthSlot = !telegramLoginConfigLoaded || telegramWidgetReady;

  const goBackToEntry = () => {
    setSmsStartCooldownSec(0);
    if (hasWebOauthAlternatives && !isMessengerMiniAppHost()) {
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
    if (deliveryChannel === "sms") {
      toast.error(SMS_DISABLED_WEB_MESSAGE);
      return { kind: "error", message: SMS_DISABLED_WEB_MESSAGE };
    }
    engageInteractive();
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
    engageInteractive();
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
        <p className="text-muted-foreground text-sm max-w-sm">{oauthEntrySubtitle}</p>
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
          {showAppleFallback ? (
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
              <TelegramLoginButton
                botUsername={telegramBotUsername}
                nextParam={nextParam}
                disabled={loading}
                onAuthEngaged={engageInteractive}
              />
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
        <MaxLoginCta
          maxAltLoading={maxAltLoading}
          maxOpenUrl={maxOpenUrl}
          variant="primary"
          onActivate={engageInteractive}
        />
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 text-sm text-muted-foreground"
          disabled={loading}
          onClick={() => {
            engageInteractive();
            setStep("phone");
          }}
        >
          Войти по номеру телефона
        </Button>
      </div>
    );
  }

  if (step === "landing" && telegramBotUsername) {
    return (
      <div id="auth-flow-v2-landing" className="flex flex-col items-center gap-5 px-4 py-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Вход</p>
        <p className="text-muted-foreground text-sm max-w-sm">{oauthEntrySubtitle}</p>
        {showOauthRow || showAppleFallback ? (
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
            {showAppleFallback ? (
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
        <TelegramLoginButton
          botUsername={telegramBotUsername}
          nextParam={nextParam}
          disabled={loading}
          onAuthEngaged={engageInteractive}
        />
        <MaxLoginCta
          maxAltLoading={maxAltLoading}
          maxOpenUrl={maxOpenUrl}
          variant="primary"
          onActivate={engageInteractive}
        />
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 text-sm text-muted-foreground"
          disabled={loading}
          onClick={() => {
            engageInteractive();
            setStep("phone");
          }}
        >
          Войти по номеру телефона
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
        {hasWebOauthAlternatives ? (
          <>
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-0 px-0 py-0 text-sm font-normal text-muted-foreground"
              onClick={() => setStep("oauth_first")}
            >
              Вход без номера
            </Button>
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">{phoneOauthCompactCaption}</p>
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
                {showAppleFallback ? (
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
                <MaxLoginCta
                  maxAltLoading={maxAltLoading}
                  maxOpenUrl={maxOpenUrl}
                  variant="outline"
                  onActivate={engageInteractive}
                />
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
            onClick={() => {
              if (telegramWidgetReady) {
                engageInteractive();
                setStep("landing");
              }
            }}
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
          {hasWebOauthAlternatives
            ? showOauthRow
              ? " Войдите через Яндекс или Google, укажите другой номер или откройте бота в Max (кнопки ниже)."
              : " Войдите через Apple, укажите другой номер или откройте бота в Max (кнопки ниже)."
            : showTelegramAuthSlot
              ? " Воспользуйтесь входом через Telegram ниже."
              : maxOpenUrl
                ? " Откройте бота в Max — кнопка ниже."
                : ""}
        </p>
        {hasWebOauthAlternatives ? (
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
              {showAppleFallback ? (
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
              <MaxLoginCta
                  maxAltLoading={maxAltLoading}
                  maxOpenUrl={maxOpenUrl}
                  variant="outline"
                  onActivate={engageInteractive}
                />
            </div>
          </div>
        ) : null}
        {!hasWebOauthAlternatives && maxOpenUrl ? (
          <a
            href={maxOpenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "default" }), AUTH_LOGIN_PRIMARY_BUTTON_CLASS)}
            onClick={() => engageInteractive()}
          >
            Войти через Max
          </a>
        ) : null}
        {showTelegramAuthSlot ? (
          <Button
            type="button"
            variant="default"
            className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
            disabled={loading || !telegramWidgetReady}
            onClick={() => {
              if (telegramWidgetReady) {
                engageInteractive();
                setStep("landing");
              }
            }}
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
          {hasWebOauthAlternatives
            ? showOauthRow
              ? " Воспользуйтесь входом без номера (Яндекс, Google, Max) — кнопки ниже."
              : " Воспользуйтесь входом без номера (Apple, Max) — кнопки ниже."
            : showTelegramAuthSlot
              ? " Войдите через Telegram."
              : maxOpenUrl
                ? " Откройте бота в Max — кнопка ниже."
                : ""}
          {supportContactHref ? " При необходимости обратитесь в поддержку." : ""}
        </p>
        {hasWebOauthAlternatives ? (
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
              {showAppleFallback ? (
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
              <MaxLoginCta
                  maxAltLoading={maxAltLoading}
                  maxOpenUrl={maxOpenUrl}
                  variant="outline"
                  onActivate={engageInteractive}
                />
            </div>
          </div>
        ) : null}
        {!hasWebOauthAlternatives && maxOpenUrl ? (
          <a
            href={maxOpenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "default" }), AUTH_LOGIN_PRIMARY_BUTTON_CLASS)}
            onClick={() => engageInteractive()}
          >
            Войти через Max
          </a>
        ) : null}
        {showTelegramAuthSlot ? (
          <Button
            type="button"
            variant="default"
            className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
            disabled={loading || !telegramWidgetReady}
            onClick={() => {
              if (telegramWidgetReady) {
                engageInteractive();
                setStep("landing");
              }
            }}
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
            engageInteractive();
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
            if (otpChannel === "sms") {
              return { kind: "error" as const, message: SMS_DISABLED_WEB_MESSAGE };
            }
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
