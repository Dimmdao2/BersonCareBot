"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { patchAdminSetting } from "./patchAdminSetting";

export type AuthProvidersSectionProps = {
  telegramLoginBotUsername: string;
  yandexOauthClientId: string;
  yandexOauthClientSecret: string;
  yandexOauthRedirectUri: string;
};

export function AuthProvidersSection({
  telegramLoginBotUsername,
  yandexOauthClientId,
  yandexOauthClientSecret,
  yandexOauthRedirectUri,
}: AuthProvidersSectionProps) {
  const [telegramBot, setTelegramBot] = useState(telegramLoginBotUsername);
  const [yandexId, setYandexId] = useState(yandexOauthClientId);
  const [yandexSecret, setYandexSecret] = useState(yandexOauthClientSecret);
  const [yandexRedirect, setYandexRedirect] = useState(yandexOauthRedirectUri);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const redirectRaw = yandexRedirect.trim();
        if (redirectRaw.length > 0) {
          try {
            const u = new URL(redirectRaw);
            if (u.protocol !== "https:" && u.protocol !== "http:") {
              setError("Yandex redirect URI: только http(s)://");
              return;
            }
          } catch {
            setError("Yandex redirect URI: укажите валидный URL");
            return;
          }
        }
        const results = await Promise.all([
          patchAdminSetting("telegram_login_bot_username", telegramBot.trim()),
          patchAdminSetting("yandex_oauth_client_id", yandexId.trim()),
          patchAdminSetting("yandex_oauth_client_secret", yandexSecret.trim()),
          patchAdminSetting("yandex_oauth_redirect_uri", redirectRaw),
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
            Провайдеры входа и OAuth-приложения. Значения в{" "}
            <code className="rounded bg-muted px-1">system_settings</code> (admin).
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
                Публичное имя для кнопки «Войти через Telegram» на веб-странице входа. Пустое — значение из env{" "}
                TELEGRAM_BOT_USERNAME.
              </span>
            </label>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Yandex OAuth</p>
            <p className="text-xs text-muted-foreground">
              Старт:{" "}
              <code className="rounded bg-muted px-1">POST /api/auth/oauth/start</code> с{" "}
              <code className="rounded bg-muted px-1">{`{ "provider": "yandex" }`}</code>, затем редирект на Яндекс. В
              публичном экране входа отдельной кнопки нет.
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
                placeholder="https://example.com/api/auth/oauth/callback"
                value={yandexRedirect}
                onChange={(e) => setYandexRedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
              <span className="text-xs text-muted-foreground">
                Должен совпадать с URI в кабинете приложения Яндекс OAuth.
              </span>
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

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Google (OAuth-клиент)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            OAuth-клиент Google Cloud (Client ID, Secret, Redirect URI) для подключения Google Calendar настраивается во
            вкладке «Интеграции» — там же сохраняется refresh token и выбор календаря. Отдельного входа пользователя через
            Google в веб-приложении сейчас нет.
          </p>
          <p className="text-sm text-muted-foreground">
            В консоли Google Cloud для одного OAuth 2.0 Client можно указать несколько Authorized redirect URIs; в БД
            сейчас хранится одна строка <code className="rounded bg-muted px-1">google_redirect_uri</code> — она
            используется потоком календаря (<code className="rounded bg-muted px-1">…/api/admin/google-calendar/callback</code>
            ).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
