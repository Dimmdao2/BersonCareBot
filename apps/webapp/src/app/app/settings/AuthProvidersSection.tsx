'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { isSafeExternalHref } from '@/lib/url/isSafeExternalHref';
import { patchAdminSetting } from './patchAdminSetting';

export type AuthProvidersSectionProps = {
  telegramLoginBotUsername: string;
  /** Ник бота MAX для диплинка max.ru/<nick>?start=… (channel-link). */
  maxLoginBotNickname: string;
  /** MAX Bot API key — проверка Mini App initData (тот же ключ, что MAX_API_KEY у интегратора). */
  maxBotApiKey: string;
  /** Ссылка для будущей кнопки «Вход с VK ID» на экране входа (https). */
  vkWebLoginUrl?: string;
  vkIdApplicationId: string;
  vkIdHasStoredClientSecret: boolean;
  vkIdRedirectUri: string;
  yandexOauthClientId: string;
  yandexOauthClientSecret: string;
  yandexOauthRedirectUri: string;
  googleClientId: string;
  googleClientSecret: string;
  googleOauthLoginRedirectUri: string;
  googleCalendarRedirectUri: string;
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
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
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
  maxBotApiKey,
  vkWebLoginUrl = '',
  vkIdApplicationId,
  vkIdHasStoredClientSecret,
  vkIdRedirectUri,
  yandexOauthClientId,
  yandexOauthClientSecret,
  yandexOauthRedirectUri,
  googleClientId,
  googleClientSecret,
  googleOauthLoginRedirectUri,
  googleCalendarRedirectUri,
  appleOauthClientId,
  appleOauthTeamId,
  appleOauthKeyId,
  appleOauthPrivateKey,
  appleOauthRedirectUri,
}: AuthProvidersSectionProps) {
  const [telegramBot, setTelegramBot] = useState(telegramLoginBotUsername);
  const [maxBotNick, setMaxBotNick] = useState(maxLoginBotNickname);
  const [maxApiKey, setMaxApiKey] = useState(maxBotApiKey);
  const [vkLoginUrl, setVkLoginUrl] = useState(vkWebLoginUrl);
  const [vkIdApplication, setVkIdApplication] = useState(vkIdApplicationId);
  const [vkIdClientSecret, setVkIdClientSecret] = useState('');
  const [vkIdRedirect, setVkIdRedirect] = useState(vkIdRedirectUri);
  const [yandexId, setYandexId] = useState(yandexOauthClientId);
  const [yandexSecret, setYandexSecret] = useState(yandexOauthClientSecret);
  const [yandexRedirect, setYandexRedirect] = useState(yandexOauthRedirectUri);
  const [gId, setGId] = useState(googleClientId);
  const [gSecret, setGSecret] = useState(googleClientSecret);
  const [gLoginRedirect, setGLoginRedirect] = useState(googleOauthLoginRedirectUri);
  const [gCalendarRedirect, setGCalendarRedirect] = useState(googleCalendarRedirectUri);
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
        const yErr = validateHttpUrl('Yandex redirect URI', yandexRedirect);
        if (yErr) {
          setError(yErr);
          return;
        }
        const gLoginErr = validateHttpUrl('Google redirect (вход)', gLoginRedirect);
        if (gLoginErr) {
          setError(gLoginErr);
          return;
        }
        const gCalendarErr = validateHttpUrl('Google redirect (Calendar)', gCalendarRedirect);
        if (gCalendarErr) {
          setError(gCalendarErr);
          return;
        }
        const vkIdRedirectErr = validateHttpUrl('VK ID redirect URI', vkIdRedirect);
        if (vkIdRedirectErr) {
          setError(vkIdRedirectErr);
          return;
        }
        const aRedirErr = validateHttpUrl('Apple redirect URI', aRedirect);
        if (aRedirErr) {
          setError(aRedirErr);
          return;
        }
        const vkTrim = vkLoginUrl.trim();
        if (vkTrim.length > 0) {
          const vkErr = validateHttpUrl('Ссылка VK ID', vkTrim);
          if (vkErr) {
            setError(vkErr);
            return;
          }
          if (!isSafeExternalHref(vkTrim)) {
            setError('Ссылка VK ID: только http(s)://');
            return;
          }
        }
        const patches = [
          patchAdminSetting('telegram_login_bot_username', telegramBot.trim()),
          patchAdminSetting('max_login_bot_nickname', maxBotNick.trim()),
          patchAdminSetting('max_bot_api_key', maxApiKey.trim()),
          patchAdminSetting('vk_web_login_url', vkTrim),
          patchAdminSetting('vk_id_application_id', vkIdApplication.trim()),
          patchAdminSetting('vk_id_redirect_uri', vkIdRedirect.trim()),
          patchAdminSetting('yandex_oauth_client_id', yandexId.trim()),
          patchAdminSetting('yandex_oauth_client_secret', yandexSecret.trim()),
          patchAdminSetting('yandex_oauth_redirect_uri', yandexRedirect.trim()),
          patchAdminSetting('google_client_id', gId.trim()),
          patchAdminSetting('google_client_secret', gSecret.trim()),
          patchAdminSetting('google_oauth_login_redirect_uri', gLoginRedirect.trim()),
          patchAdminSetting('google_redirect_uri', gCalendarRedirect.trim()),
          patchAdminSetting('apple_oauth_client_id', aClientId.trim()),
          patchAdminSetting('apple_oauth_team_id', aTeam.trim()),
          patchAdminSetting('apple_oauth_key_id', aKeyId.trim()),
          patchAdminSetting('apple_oauth_private_key', aPem.trim()),
          patchAdminSetting('apple_oauth_redirect_uri', aRedirect.trim()),
        ];
        if (vkIdClientSecret.trim().length > 0) {
          patches.push(patchAdminSetting('vk_id_client_secret', vkIdClientSecret.trim()));
        }
        const results = await Promise.all(patches);
        if (results.some((r) => !r)) {
          setError('Не удалось сохранить часть настроек');
          return;
        }
        setVkIdClientSecret('');
        setSaved(true);
      } catch {
        setError('Ошибка при сохранении');
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Авторизация</CardTitle>
          <p className="text-xs text-muted-foreground">
            Провайдеры входа и OAuth. Значения в{' '}
            <code className="rounded bg-muted px-1">system_settings</code> (admin). Redirect для
            календаря Google — во этой платформенной форме; клиника подключает только свой аккаунт и
            календарь.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Telegram Login Widget</p>
            <DoctorField
              label="Имя бота (без @)"
              htmlFor="auth-telegram-bot"
              hint="Публичный username бота без @ (как в t.me/…), не числовой id бота. Пустое значение отключает диплинк."
            >
              <Input
                id="auth-telegram-bot"
                type="text"
                placeholder="bersoncare_bot"
                value={telegramBot}
                onChange={(e) => setTelegramBot(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
            </DoctorField>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">MAX — привязка в браузере (channel-link)</p>
            <DoctorField
              label="Ник бота или ссылка max.ru"
              htmlFor="auth-max-bot"
              width="lg"
              hint={
                <>
                  Для автоматического открытия бота с токеном привязки: ник из публичной ссылки (как
                  в <code className="rounded bg-muted px-0.5">max.ru/ник</code>). Можно вставить
                  полный URL. Пустое — только команда{' '}
                  <code className="rounded bg-muted px-0.5">/start link_…</code> без перехода.
                  Документация:{' '}
                  <a
                    className="text-primary underline"
                    href="https://dev.max.ru/docs/chatbots/bots-coding/prepare#%D0%A0%D0%B0%D0%B1%D0%BE%D1%82%D0%B0%D0%B5%D0%BC%20%D1%81%20%D0%B4%D0%B8%D0%BF%D0%BB%D0%B8%D0%BD%D0%BA%D0%B0%D0%BC%D0%B8"
                    target="_blank"
                    rel="noreferrer"
                  >
                    MAX — диплинки
                  </a>
                  .
                </>
              }
            >
              <Input
                id="auth-max-bot"
                type="text"
                placeholder="id123456789_1_bot или https://max.ru/id123456789_1_bot"
                value={maxBotNick}
                onChange={(e) => setMaxBotNick(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField
              label="MAX Bot API key (Mini App initData)"
              htmlFor="auth-max-api-key"
              width="lg"
              hint={
                <>
                  Нужен для входа в веб-приложение из MAX Mini App без{' '}
                  <code className="rounded bg-muted px-0.5">?t=</code> в URL. Подпись стартовых
                  параметров —{' '}
                  <a
                    className="text-primary underline"
                    href="https://dev.max.ru/docs/webapps/validation"
                    target="_blank"
                    rel="noreferrer"
                  >
                    dev.max.ru — валидация WebApp
                  </a>
                  .
                </>
              }
            >
              <Input
                id="auth-max-api-key"
                type="password"
                placeholder="Тот же ключ, что MAX_API_KEY в env интегратора"
                value={maxApiKey}
                onChange={(e) => setMaxApiKey(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">VK ID</p>
            <p className="text-xs text-muted-foreground">
              Для серверного OAuth 2.1 нужны ID приложения, защищённый ключ и точный redirect URI.
              Сервисный ключ доступа VK API для входа через VK ID не требуется и здесь не хранится.
            </p>
            <DoctorField label="ID приложения (client_id / APP_ID)" htmlFor="auth-vk-client-id">
              <Input
                id="auth-vk-client-id"
                type="text"
                value={vkIdApplication}
                onChange={(e) => setVkIdApplication(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField
              label="Защищённый ключ (client_secret)"
              htmlFor="auth-vk-client-secret"
              width="lg"
              hint="Значение не возвращается в браузер. Пустое поле не перезаписывает уже сохранённый ключ."
            >
              <Input
                id="auth-vk-client-secret"
                type="password"
                placeholder={
                  vkIdHasStoredClientSecret
                    ? 'Сохранён; оставьте пустым, чтобы не менять'
                    : 'Вставьте защищённый ключ'
                }
                value={vkIdClientSecret}
                onChange={(e) => setVkIdClientSecret(e.target.value)}
                disabled={isPending}
                autoComplete="new-password"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField label="Redirect URI (callback)" htmlFor="auth-vk-redirect" width="lg">
              <Input
                id="auth-vk-redirect"
                type="url"
                placeholder="https://example.com/api/auth/oauth/callback/vk-id"
                value={vkIdRedirect}
                onChange={(e) => setVkIdRedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField
              label="Старый URL входа (не OAuth credential)"
              htmlFor="auth-vk-legacy-url"
              width="lg"
              hint="Сохраняется для совместимости с будущей кнопкой-ссылкой; OAuth callback должен использовать поле выше."
            >
              <Input
                id="auth-vk-legacy-url"
                type="url"
                placeholder="https://id.vk.com/… или ссылка на мини-приложение"
                value={vkLoginUrl}
                onChange={(e) => setVkLoginUrl(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Yandex OAuth</p>
            <p className="text-xs text-muted-foreground">
              Старт: <code className="rounded bg-muted px-1">POST /api/auth/oauth/start</code> с{' '}
              <code className="rounded bg-muted px-1">{`{ "provider": "yandex" }`}</code> и кнопка
              на экране входа.
            </p>
            <DoctorField label="Client ID" htmlFor="auth-yandex-client-id">
              <Input
                id="auth-yandex-client-id"
                type="text"
                value={yandexId}
                onChange={(e) => setYandexId(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
            </DoctorField>
            <DoctorField label="Client secret" htmlFor="auth-yandex-client-secret" width="lg">
              <Input
                id="auth-yandex-client-secret"
                type="password"
                value={yandexSecret}
                onChange={(e) => setYandexSecret(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
            </DoctorField>
            <DoctorField
              label="Redirect URI (callback)"
              htmlFor="auth-yandex-redirect"
              width="lg"
              hint={
                <>
                  В кабинете Яндекса укажите{' '}
                  <code className="rounded bg-muted px-1">…/api/auth/oauth/callback/yandex</code>.
                  Старый путь{' '}
                  <code className="rounded bg-muted px-1">…/api/auth/oauth/callback</code> без
                  суффикса по-прежнему обрабатывается, но не рекомендуется для новых настроек.
                </>
              }
            >
              <Input
                id="auth-yandex-redirect"
                type="url"
                placeholder="https://example.com/api/auth/oauth/callback/yandex"
                value={yandexRedirect}
                onChange={(e) => setYandexRedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
              />
            </DoctorField>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Google OAuth (вход + общий клиент для Calendar)</p>
            <p className="text-xs text-muted-foreground">
              В Google Cloud Console добавьте два Authorized redirect URI: этот (вход) и Calendar
              callback ниже.
            </p>
            <DoctorField label="Client ID" htmlFor="auth-google-client-id" width="lg">
              <Input
                id="auth-google-client-id"
                type="text"
                value={gId}
                onChange={(e) => setGId(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField
              label="Redirect URI для Calendar"
              htmlFor="auth-google-calendar-redirect"
              width="lg"
              hint="Это OAuth callback нашего приложения, общий для всех клиник. Учётную запись и календарь выбирает каждая клиника в своих настройках."
            >
              <Input
                id="auth-google-calendar-redirect"
                type="url"
                placeholder="https://example.com/api/admin/google-calendar/callback"
                value={gCalendarRedirect}
                onChange={(e) => setGCalendarRedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField label="Client secret" htmlFor="auth-google-client-secret" width="lg">
              <Input
                id="auth-google-client-secret"
                type="password"
                value={gSecret}
                onChange={(e) => setGSecret(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField
              label="Redirect URI для веб-входа"
              htmlFor="auth-google-login-redirect"
              width="lg"
            >
              <Input
                id="auth-google-login-redirect"
                type="url"
                placeholder="https://example.com/api/auth/oauth/callback/google"
                value={gLoginRedirect}
                onChange={(e) => setGLoginRedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Sign in with Apple</p>
            <p className="text-xs text-muted-foreground">
              Services ID, ключ .p8 (PKCS#8 PEM), Team ID и Key ID из Apple Developer. Return URL =
              redirect ниже (обычно{' '}
              <code className="rounded bg-muted px-1">https://…/api/auth/oauth/callback/apple</code>
              , только POST). В проде — HTTPS.
            </p>
            <DoctorField label="Services ID (Client ID)" htmlFor="auth-apple-client-id">
              <Input
                id="auth-apple-client-id"
                type="text"
                value={aClientId}
                onChange={(e) => setAClientId(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField label="Team ID" htmlFor="auth-apple-team-id" width="sm">
              <Input
                id="auth-apple-team-id"
                type="text"
                value={aTeam}
                onChange={(e) => setATeam(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField label="Key ID" htmlFor="auth-apple-key-id" width="sm">
              <Input
                id="auth-apple-key-id"
                type="text"
                value={aKeyId}
                onChange={(e) => setAKeyId(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
            <DoctorField label="Private key (.p8 PEM)" htmlFor="auth-apple-private-key" width="lg">
              <Textarea
                id="auth-apple-private-key"
                className="min-h-28 font-mono text-xs"
                value={aPem}
                onChange={(e) => setAPem(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                placeholder="-----BEGIN PRIVATE KEY-----"
              />
            </DoctorField>
            <DoctorField label="Redirect URI" htmlFor="auth-apple-redirect" width="lg">
              <Input
                id="auth-apple-redirect"
                type="url"
                placeholder="https://example.com/api/auth/oauth/callback/apple"
                value={aRedirect}
                onChange={(e) => setARedirect(e.target.value)}
                disabled={isPending}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </DoctorField>
          </section>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Сохранение…' : 'Сохранить'}
            </Button>
            {saved && <span className="text-sm text-green-600">Сохранено</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
