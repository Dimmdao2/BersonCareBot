# Platform context (webapp)

Механизм определяет, в каком контексте открыт UI: **бот** (Telegram / MAX Mini App), **мобильный браузер / PWA** или **десктоп**.

## Режимы

- **PlatformEntry** (`bot` | `standalone`) — как пользователь попал. Читается на сервере из cookie `bersoncare_platform` ([platformCookie.server.ts](platformCookie.server.ts)).
- **PlatformMode** (`bot` | `mobile` | `desktop`) — итог для клиентских компонентов. Даёт [PlatformProvider.tsx](../ui/PlatformProvider.tsx) и хук `usePlatform()` ([usePlatform.ts](../hooks/usePlatform.ts)).

Логика: если открыто в Mini App (`isMessengerMiniAppHost()`), режим всегда `bot`. Иначе — по ширине viewport (`DESKTOP_BREAKPOINT` = 768px, как Tailwind `md:`).

## Cookie

- Имя: `bersoncare_platform`, значение `bot` для контекста бота.
- **Proxy** ([proxy.ts](../../proxy.ts), [middleware/platformContext.ts](../../middleware/platformContext.ts)): **канон (2026-05)** — первый заход по путям **`/app/tg`** / **`/app/max`**; для **`/app/patient/*`** при необходимости пробрасываются **`x-bc-pathname`** / **`x-bc-search`**. **Legacy:** запрос с **`?ctx=bot|max` на `/app`** выставляет platform/surface-cookies и редиректит URL без `ctx`; при **`ctx=max` на `/app`** — редирект на **`/app/max`** (reply keyboard и старые ссылки могут ещё открывать с `ctx`).
- В production cookie: `SameSite=None; Secure` (iframe Mini App). В dev на http: `Lax` без `Secure`.
- **Клиентский fallback**: если Mini App открылся без предварительной cookie бота, [PlatformProvider.tsx](../ui/PlatformProvider.tsx) может записать её через `serializePlatformBotCookie()` ([platform.ts](platform.ts)) после детекта хоста/SDK.

## Навигация пациента

Декларативные конфиги по `PlatformMode`: [app-layer/routes/navigation.ts](../../app-layer/routes/navigation.ts) (`patientNavByPlatform`, primary nav). Состав блоков главной «Сегодня» задаётся в БД (`patient_home_blocks`), не в этом файле.

## Связанные файлы

- [platform.ts](platform.ts) — типы, константы, сериализация cookie для `document.cookie`
- [messengerMiniApp.ts](messengerMiniApp.ts) — детект Mini App на клиенте
