# Platform context (webapp)

Механизм определяет, в каком контексте открыт UI: **бот** (Telegram / MAX Mini App), **мобильный браузер / PWA** или **десктоп**.

## Режимы

- **PlatformEntry** (`bot` | `standalone`) — как пользователь попал. Читается на сервере из cookie `bersoncare_platform` ([platformCookie.server.ts](platformCookie.server.ts)).
- **PlatformMode** (`bot` | `mobile` | `desktop`) — итог для клиентских компонентов. Даёт [PlatformProvider.tsx](../ui/PlatformProvider.tsx) и хук `usePlatform()` ([usePlatform.ts](../hooks/usePlatform.ts)).

Логика: если открыто в Mini App (`isMessengerMiniAppHost()`), режим всегда `bot`. Иначе — по ширине viewport (`DESKTOP_BREAKPOINT` = 768px, как Tailwind `md:`).

## Cookie

- Имя: `bersoncare_platform`, значение `bot` для контекста бота.
- **Proxy** ([proxy.ts](../../proxy.ts), [middleware/platformContext.ts](../../middleware/platformContext.ts)): **канон (2026-05)** — первый заход по путям **`/app/tg`** / **`/app/max`**; на этих entry proxy вызывает **`applyMessengerEntryPathCookies`**: если cookie **`bersoncare_platform=bot`** ещё нет, выставляются **`bot`** + **`bersoncare_messenger_surface`** (`telegram` | `max`) — чтобы **`PwaAppAccessGate`** и **`isMessengerMiniAppHost()`** не сбрасывали кабинет на лендинг при server redirect в **`/app/patient`** (например уже есть сессия, а initData ещё пуст). Повторная запись не делается, если **`bot`** уже в cookie. **Legacy:** запрос с **`?ctx=bot|max` на `/app`** выставляет те же cookies через **`handlePlatformContextRequest`** и редиректит URL без `ctx`; при **`ctx=max` на `/app`** — редирект на **`/app/max`** (reply keyboard и старые ссылки могут ещё открывать с `ctx`).
- В production cookie: `SameSite=None; Secure` (iframe Mini App). В dev на http: `Lax` без `Secure`.
- **Клиентский fallback**: если Mini App открылся без предварительной cookie бота, [PlatformProvider.tsx](../ui/PlatformProvider.tsx) может записать её через `serializePlatformBotCookie()` ([platform.ts](platform.ts)) после детекта хоста/SDK.

## NativeRuntime (M3)

Отдельный, ортогональный `PlatformMode` факт: `browser` | `therapygo_android` | `therapysto_android` +
`version` + `capabilities {jitsi,media,push}`. Едет тем же единственным `PlatformProvider`
(`NativeRuntimeContext`, хук `useNativeRuntime()` в [useNativeRuntime.ts](../hooks/useNativeRuntime.ts)) —
второго глобального provider нет. Единственный адаптер, читающий `window.Capacitor`/`ShellRuntime`/
`UniversalPush`, — [nativeShellRuntime.ts](nativeShellRuntime.ts); он валидирует JSON рантайма и
маппит shell `brand` в закрытый `kind`, откатываясь в `browser` без белого экрана при отсутствующем
plugin, отклонении или недоверенной странице. Runtime-факты — только presentation/capability, они
никогда не авторизуют роль/организацию/доступ (`AGENTS.md` §5, `MASTER_PLAN.md` M3-02).

`isNativeShellActive()` (синхронный, не gated trust-origin) используется PWA/service-worker/install
шлюзами (M1-07) — `registerPatientServiceWorker`, `LandingPwaClientBootstrap`, `StaffPwaBootstrap`,
`PwaInstallSection`, `StaffPwaInstallSection`, `pushCapability.ts` — чтобы не регистрировать `/sw.js`,
не подписываться на `beforeinstallprompt` и не создавать browser `PushManager`/VAPID подписки внутри
Capacitor. Native Universal Push client — `shared/lib/nativePush/`.

## Навигация пациента

Декларативные конфиги по `PlatformMode`: [app-layer/routes/navigation.ts](../../app-layer/routes/navigation.ts) (`patientNavByPlatform`, primary nav). Состав блоков главной «Сегодня» задаётся в БД (`patient_home_blocks`), не в этом файле.

## Связанные файлы

- [platform.ts](platform.ts) — типы, константы, сериализация cookie для `document.cookie`
- [messengerMiniApp.ts](messengerMiniApp.ts) — детект Mini App на клиенте
