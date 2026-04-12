"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { patchAdminSetting } from "./patchAdminSetting";

export type AuthProvidersSectionProps = {
  telegramLoginBotUsername: string;
  /** Ник бота MAX для диплинка max.ru/<nick>?start=… (channel-link). */
  maxLoginBotNickname: string;
  yandexOauthClientId: string;
  yandexOauthClientSecret: string;
  yandexOauthRedirectUri: string;
  googleClientId: string;
  googleClientSecret: string;
  googleOauthLoginRedirectUri: string;
  appleOauthClientId: string;
  appleOauthTeamId: string;
  appleOauthKeyId: string;
  appleOauthPrivateKey: string;
  appleOauthRedirectUri: string;
};

function validateHttpUrl(label: string, raw: string): string | null {
  const t = raw.trim();
  if (t.length === 0) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return `${label}: только http(s)://`;
    }
  } catch {
    return `${label}: укажите валидный URL`;
  }
  return null;
}

export function AuthProvidersSection({
  telegramLoginBotUsername,
  maxLoginBotNickname,
  yandexOauthClientId,
  yandexOauthClientSecret,
  yandexOauthRedirectUri,
  googleClientId,
  googleClientSecret,
  googleOauthLoginRedirectUri,
  appleOauthClientId,
  appleOauthTeamId,
  appleOauthKeyId,
  appleOauthPrivateKey,
  appleOauthRedirectUri,
}: AuthProvidersSectionProps) {
  const [telegramBot, setTelegramBot] = useState(telegramLoginBotUsername);
  const [maxBotNick, setMaxBotNick] = useState(maxLoginBotNickname);
  const [yandexId, setYandexId] = useState(yandexOauthClientId);
  const [yandexSecret, setYandexSecret] = useState(yandexOauthClientSecret);
  const [yandexRedirect, setYandexRedirect] = useState(yandexOauthRedirectUri);
  const [gId, setGId] = useState(googleClientId);
  const [gSecret, setGSecret] = useState(googleClientSecret);
  const [gLoginRedirect, setGLoginRedirect] = useState(googleOauthLoginRedirectUri);
  const [aClientId, setAClientId] = useState(appleOauthClientId);
  const [aTeam, setATeam] = useState(appleOauthTeamId);
  const [aKeyId, setAKeyId] = useState(appleOauthKeyId);
  const [aPem, setAPem] = useState(appleOauthPrivateKey);
  const [aRedirect, setARedirect] = useState(appleOauthRedirectUri);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const yErr = validateHttpUrl("Yandex redirect URI", yandexRedirect);
        if (yErr) {
          setError(yErr);
          return;
        }
        const gLoginErr = validateHttpUrl("Google redirect (вход)", gLoginRedirect);
        if (gLoginErr) {
          setError(gLoginErr);
          return;
        }
        const aRedirErr = validateHttpUrl("Apple redirect URI", aRedirect);
        if (aRedirErr) {
          setError(aRedirErr);
          return;
        }
        const results = await Promise.all([
          patchAdminSetting("telegram_login_bot_username", telegramBot.trim()),
          patchAdminSetting("max_login_bot_nickname", maxBotNick.trim()),
          patchAdminSetting("yandex_oauth_client_id", yandexId.trim()),
          patchAdminSetting("yandex_oauth_client_secret", yandexSecret.trim()),
          patchAdminSetting("yandex_oauth_redirect_uri", yandexRedirect.trim()),
          patchAdminSetting("google_client_id", gId.trim()),
          patchAdminSetting("google_client_secret", gSecret.trim()),
          patchAdminSetting("google_oauth_login_redirect_uri", gLoginRedirect.trim()),
          patchAdminSetting("apple_oauth_client_id", aClientId.trim()),
          patchAdminSetting("apple_oauth_team_id", aTeam.trim()),
          patchAdminSetting("apple_oauth_key_id", aKeyId.trim()),
          patchAdminSetting("apple_oauth_private_key", aPem.trim()),
          patchAdminSetting("apple_oauth_redirect_uri", aRedirect.trim()),
        ]);
        if (results.some((r) => !r)) {
          setError("Не удалось сохранить часть настроек");
          return;
        }
        setSaved(true);
      } catch {
        setError("Ошибка при сохранении");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Авторизация</CardTitle>
          <p className="text-xs text-muted-foreground">
            Провайдеры входа и OAuth. Значения в{" "}
            <code className="rounded bg-muted px-1">system_settings</code> (admin). Redirect для календаря Google — во
            вкладке «Интеграции».
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Telegram Login Widget</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Имя бота (без @)</span>
              <Input
                type="text"
                placeholder="bersoncare_bot"
                value={telegramBot}
                onChange={(e) => setTelegramBot(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
              <span className="text-xs text-muted-foreground">
                Публичный username бота без @ (как в t.me/…), не числовой id бота. Пустое — fallback из env{" "}
                <code className="rounded bg-muted px-0.5">TELEGRAM_BOT_USERNAME</code> (тоже username, не id; env whitelist{" "}
                <code className="rounded bg-muted px-0.5">ALLOWED_TELEGRAM_IDS</code> — это user id людей).
              </span>
            </label>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">MAX — привязка в браузере (channel-link)</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Ник бота или ссылка max.ru</span>
              <Input
                type="text"
                placeholder="id123456789_1_bot или https://max.ru/id123456789_1_bot"
                value={maxBotNick}
                onChange={(e) => setMaxBotNick(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
              <span className="text-xs text-muted-foreground">
                Для автоматического открытия бота с токеном привязки: ник из публичной ссылки (как в{" "}
                <code className="rounded bg-muted px-0.5">max.ru/ник</code>
                ). Можно вставить полный URL. Пустое — только команда{" "}
                <code className="rounded bg-muted px-0.5">/start link_…</code> без перехода. Fallback: env{" "}
                <code className="rounded bg-muted px-0.5">MAX_LOGIN_BOT_NICKNAME</code>. Документация:{" "}
                <a
                  className="text-primary underline"
                  href="https://dev.max.ru/docs/chatbots/bots-coding/prepare#%D0%A0%D0%B0%D0%B1%D0%BE%D1%82%D0%B0%D0%B5%D0%BC%20%D1%81%20%D0%B4%D0%B8%D0%BF%D0%BB%D0%B8%D0%BD%D0%BA%D0%B0%D0%BC%D0%B8"
                  target="_blank"
                  rel="noreferrer"
                >
                  MAX — диплинки
                </a>
                .
              </span>
            </label>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Yandex OAuth</p>
            <p className="text-xs text-muted-foreground">
              Старт: <code className="rounded bg-muted px-1">POST /api/auth/oauth/start</code> с{" "}
              <code className="rounded bg-muted px-1">{`{ "provider": "yandex" }`}</code> и кнопка на экране входа.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Client ID</span>
              <Input
                type="text"
                value={yandexId}
                onChange={(e) => setYandexId(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Client secret</span>
              <Input
                type="password"
                value={yandexSecret}
                onChange={(e) => setYandexSecret(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Redirect URI (callback)</span>
              <Input
                type="url"
                placeholder="https://example.com/api/auth/oauth/callback/yandex"
                value={yandexRedirect}
                onChange={(e) => setYandexRedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
              <span className="text-xs text-muted-foreground">
                В кабинете Яндекса укажите{" "}
                <code className="rounded bg-muted px-1">…/api/auth/oauth/callback/yandex</code>. Старый путь{" "}
                <code className="rounded bg-muted px-1">…/api/auth/oauth/callback</code> без суффикса по-прежнему
                обрабатывается, но не рекомендуется для новых настроек.
              </span>
            </label>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Google OAuth (вход + общий клиент для Calendar)</p>
            <p className="text-xs text-muted-foreground">
              В Google Cloud Console добавьте два Authorized redirect URI: этот (вход) и URI календаря из вкладки
              «Интеграции» (<code className="rounded bg-muted px-1">…/api/admin/google-calendar/callback</code>).
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Client ID</span>
              <Input
                type="text"
                value={gId}
                onChange={(e) => setGId(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Client secret</span>
              <Input
                type="password"
                value={gSecret}
                onChange={(e) => setGSecret(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Redirect URI для веб-входа</span>
              <Input
                type="url"
                placeholder="https://example.com/api/auth/oauth/callback/google"
                value={gLoginRedirect}
                onChange={(e) => setGLoginRedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </label>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Sign in with Apple</p>
            <p className="text-xs text-muted-foreground">
              Services ID, ключ .p8 (PKCS#8 PEM), Team ID и Key ID из Apple Developer. Return URL = redirect ниже
              (обычно <code className="rounded bg-muted px-1">https://…/api/auth/oauth/callback/apple</code>, только
              POST). В проде — HTTPS.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Services ID (Client ID)</span>
              <Input
                type="text"
                value={aClientId}
                onChange={(e) => setAClientId(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Team ID</span>
              <Input
                type="text"
                value={aTeam}
                onChange={(e) => setATeam(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Key ID</span>
              <Input
                type="text"
                value={aKeyId}
                onChange={(e) => setAKeyId(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Private key (.p8 PEM)</span>
              <textarea
                className="min-h-28 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={aPem}
                onChange={(e) => setAPem(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                placeholder="-----BEGIN PRIVATE KEY-----"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Redirect URI</span>
              <Input
                type="url"
                placeholder="https://example.com/api/auth/oauth/callback/apple"
                value={aRedirect}
                onChange={(e) => setARedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </label>
          </section>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleSave} disabled={isPending}>
              {isPending ? "Сохранение…" : "Сохранить"}
            </Button>
            {saved && <span className="text-sm text-green-600">Сохранено</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
