# FINAL_FIX_RECOMMENDATIONS

Статический аудит кода после реализации этапов 0–14.  
Дата: 2026-03-24. CI: зелёный.

---

## Условные обозначения

| Приоритет | Значение |
|-----------|----------|
| 🔴 CRITICAL | Безопасность / потеря данных |
| 🟠 HIGH | Производительность / логика |
| 🟡 MEDIUM | Архитектура / технический долг |
| 🟢 LOW | Качество кода / минорное |

---

## 1. БЕЗОПАСНОСТЬ

### 🔴 SEC-01 — Timing attack в `validateTelegramInitData`

**Файл:** `apps/webapp/src/modules/auth/service.ts`, строка 197

```ts
if (computedHash !== hash) return null;  // ← небезопасное сравнение строк
```

JavaScript-строковое сравнение завершается раньше при первом несовпадении байта, что позволяет провести timing-атаку для подбора HMAC-подписи initData Telegram.

**Рекомендация:** Заменить на `timingSafeEqual` (уже импортирован в этом файле):

```ts
const computedBuf = Buffer.from(computedHash, "hex");
const hashBuf = Buffer.from(hash, "hex");
if (computedBuf.length !== hashBuf.length || !timingSafeEqual(computedBuf, hashBuf)) return null;
```

---

### 🔴 SEC-02 — `parseIntegratorToken` без try/catch вокруг `JSON.parse`

**Файл:** `apps/webapp/src/modules/auth/service.ts`, строки 82–86

```ts
function parseIntegratorToken(token: string): IntegratorTokenPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload, integratorWebappEntrySecret()))) return null;
  const parsed = JSON.parse(decodeBase64Url(payload)) as IntegratorTokenPayload; // ← бросит исключение
```

Если `decodeBase64Url` возвращает невалидный JSON или сама бросает при неверном base64 — запрос падает с 500. Хотя HMAC-проверка защищает от внешних атакующих, внутренняя ошибка (невалидный токен от своего же integrator) приведёт к необработанному падению.

**Рекомендация:**

```ts
let parsed: IntegratorTokenPayload;
try {
  parsed = JSON.parse(decodeBase64Url(payload)) as IntegratorTokenPayload;
} catch {
  return null;
}
```

---

### 🟠 SEC-03 — In-memory rate limiting не работает при нескольких инстансах

**Файлы:**
- `apps/webapp/src/modules/auth/checkPhoneRateLimit.ts`
- `apps/webapp/src/modules/auth/pinSetRateLimit.ts`
- `apps/webapp/src/modules/auth/messengerStartRateLimit.ts`

Все rate-limiters используют `Map<string, number[]>` в памяти процесса. При двух и более инстансах Node (или при PM2 cluster mode) каждый процесс видит только своих клиентов → злоумышленник обходит лимиты, опрашивая разные инстансы.

**Рекомендация:** При масштабировании — Redis + `ioredis`, либо внешний edge rate-limiter (nginx `limit_req`). Зафиксировать ограничение в `SERVER CONVENTIONS.md`.

---

### 🟠 SEC-04 — Media upload: валидация MIME по заголовку клиента

**Файл:** `apps/webapp/src/app/api/media/upload/route.ts`, строка 49

```ts
const mime = (file.type || "application/octet-stream").toLowerCase();
if (!ALLOWED_MIME.has(mime)) { ... }
```

`file.type` — это Content-Type, заявленный клиентом при формировании FormData. Клиент может отправить `image/jpeg` для файла с PHP-кодом. При сохранении файлов на диск и возможной последующей отдаче через nginx это открывает путь к хранению исполняемого контента.

**Рекомендация:** Добавить проверку magic-bytes (первые 4–8 байт буфера). Пример библиотеки: `file-type` (npm). Или хотя бы проверять расширение имени файла совместно с MIME.

---

### 🟠 SEC-05 — `messenger/start`: plain token в теле ответа

**Файл:** `apps/webapp/src/app/api/auth/messenger/start/route.ts`, строка 66

```ts
return NextResponse.json({
  ok: true,
  token: plain,         // ← raw login token в теле HTTP-ответа
  expiresAt: ...,
  deepLink: ...
});
```

Одноразовый login-token передаётся в ответе. Если не HTTPS, токен можно перехватить. `deepLink` уже содержит его — повторная отправка через `token: plain` избыточна и увеличивает attack surface.

**Рекомендация:** Убрать поле `token` из ответа. Клиент должен использовать только `deepLink`.

---

### 🟡 SEC-06 — OAuth callback: `state` не проверяется (CSRF)

**Файл:** `apps/webapp/src/app/api/auth/oauth/callback/route.ts`

Файл является заглушкой, но комментарий явно указывает на пропущенную CSRF-защиту:

```ts
// При полной реализации (этап 5.5): проверить `state` против cookie/session (CSRF)
```

При реализации OAuth важно: `state` генерировать на сервере, хранить в httpOnly cookie, сверять при callback до обмена `code` на token. **Без этого — полноценный CSRF OAuth-flow.**

---

### 🟡 SEC-07 — `sameSite: "lax"` на session cookie

**Файл:** `apps/webapp/src/modules/auth/service.ts` (везде где `cookieStore.set`)

`sameSite: "lax"` разрешает отправку cookie при top-level навигации от сторонних сайтов (переходах по ссылкам). Для дополнительной защиты рассмотреть `sameSite: "strict"`, особенно в контексте Telegram Web App (открывается в iframe/webview, где lax может вести себя непредсказуемо).

---

## 2. ПРОИЗВОДИТЕЛЬНОСТЬ

### 🟠 PERF-01 — Двойной запрос к БД в `getMessages` и `sendAdminReply`

**Файл:** `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts`

```ts
async getMessages(conversationId, params) {
  const data = await port.getConversationWithMessages(conversationId); // загружает ВСЕ сообщения
  if (!data) return null;
  const messages = await port.listMessagesSince(conversationId, ...); // снова запрос
  return { messages };
}

async sendAdminReply(conversationId, text) {
  const data = await port.getConversationWithMessages(conversationId); // загружает ВСЕ сообщения
  if (!data) return { ok: false, error: "not_found" };
  // ...отправка...
}
```

`getConversationWithMessages` загружает полную историю сообщений только для проверки существования диалога.

**Рекомендация:** Добавить в `SupportCommunicationPort` лёгкий метод:

```ts
conversationExists(conversationId: string): Promise<boolean>
```

Реализация: `SELECT 1 FROM support_conversations WHERE id = $1 LIMIT 1`.

Использовать в `getMessages` и `sendAdminReply` вместо `getConversationWithMessages`.

---

### 🟠 PERF-02 — `getStats()` делает 3 лишних запроса вместо 1

**Файл:** `apps/webapp/src/modules/doctor-stats/service.ts`, строки 54–61

```ts
const [appointmentStats, allClients] = await Promise.all([
  deps.getAppointmentStats({ range: "week" }),
  deps.listClients({}),
]);

const withTelegram = (await deps.listClients({ hasTelegram: true })).length; // ← 2-й запрос
const withMax = (await deps.listClients({ hasMax: true })).length;           // ← 3-й запрос
```

`allClients` уже содержит все данные — подсчёт `withTelegram` и `withMax` можно сделать из него же.

**Рекомендация:** Убрать два отдельных вызова `listClients`:

```ts
const withTelegram = allClients.filter(c => c.bindings.telegramId?.trim()).length;
const withMax = allClients.filter(c => c.bindings.maxId?.trim()).length;
```

---

### 🟠 PERF-03 — `incrementNewsViews` на каждый рендер главной

**Файл:** `apps/webapp/src/app/app/patient/page.tsx`, строка 62

```ts
if (session?.user && homeNews) {
  await incrementNewsViews(homeNews.id); // блокирует рендер, вызывается синхронно
}
```

Проблема двойная:
1. Вызов блокирует ответ (последовательный `await` после `Promise.all`).
2. Каждый refresh увеличивает счётчик — нет дедупликации по сессии/сутки.

**Рекомендация краткосрочная:** Запускать fire-and-forget без await:
```ts
void incrementNewsViews(homeNews.id);
```

**Рекомендация долгосрочная (FIX_PLAN_STAGE_10):** Дедупликация по `(user_id, news_id, DATE(now()))` в отдельной таблице.

---

### 🟡 PERF-04 — `buildAppDeps()` пересоздаёт `doctorClients` на каждый запрос

**Файл:** `apps/webapp/src/app-layer/di/buildAppDeps.ts`, строка 224

```ts
export function buildAppDeps() {
  const doctorClients = createDoctorClientsService({  // ← создаётся заново на каждый вызов
    clientsPort: doctorClientsPort,
    ...
  });
  return { doctorClients, ... };
}
```

Все зависимости (`clientsPort`, `symptomDiaryService`, etc.) — модульные синглтоны. Само создание `doctorClients` — дешёвое создание объекта, но при 100 RPS это ~100 лишних объектных аллокаций в секунду.

**Рекомендация:** Вынести `const doctorClients = createDoctorClientsService(...)` на уровень модуля (рядом с остальными синглтонами) или мемоизировать результат `buildAppDeps`.

---

### 🟡 PERF-05 — Полный scan таблицы мотивационных цитат

**Файл:** `apps/webapp/src/modules/patient-home/newsMotivation.ts`, строки 54–67

```ts
const r = await pool.query<...>(
  `SELECT id, body_text, author FROM motivational_quotes
   WHERE is_active = true AND archived_at IS NULL
   ORDER BY sort_order ASC, id ASC`  // ← без LIMIT
);
// ...
const idx = h.readUInt32BE(0) % rows.length;
```

Загружает ВСЕ активные цитаты. При 1000+ цитат — неэффективно.

**Рекомендация:** Считать COUNT заранее, вычислять `idx`, затем `LIMIT 1 OFFSET idx`:

```sql
SELECT id, body_text, author FROM motivational_quotes
WHERE is_active = true AND archived_at IS NULL
ORDER BY sort_order ASC, id ASC
LIMIT 1 OFFSET $1
```

---

### 🟡 PERF-06 — `DoctorClientsPage`: полная загрузка клиентов без пагинации

**Файл:** `apps/webapp/src/app/app/doctor/clients/page.tsx`, строка 29

```ts
deps.doctorClients.listClients({ onlyWithAppointmentRecords: true })
```

Нет ограничения числа строк. При росте базы (1000+ клиентов) это Full Table Scan + передача всего массива в браузер.

**Рекомендация:** Добавить серверную пагинацию или infinite-scroll. Минимум — `LIMIT 500` в SQL-запросе с индикатором «показаны первые N».

---

## 3. АРХИТЕКТУРА

### 🟡 ARCH-01 — Нарушение границ слоёв: `shared/ui` → `modules/messaging`

**Файлы:** `apps/webapp/src/shared/ui/PatientHeader.tsx`, `DoctorHeader.tsx`

Заголовки импортируют `useSupportUnreadPolling` из `modules/messaging/hooks`. Слой `shared/ui` по архитектуре должен быть независим от feature-модулей.

**Рекомендация:** Вынести хук в `apps/webapp/src/shared/hooks/useSupportUnreadPolling.ts` (re-export из messaging если нужно), либо прокидывать `unreadCount` как проп к Header сверху (из AppShell или layout).

---

### 🟡 ARCH-02 — `getUpcomingAppointments` в `buildAppDeps`: сырой SQL внутри DI-слоя

**Файл:** `apps/webapp/src/app-layer/di/buildAppDeps.ts`, строки 163–169

```ts
const pool = getPool();
const res = await pool.query<...>("SELECT phone_normalized FROM platform_users WHERE id = $1", [userId]);
```

Прямой вызов `pool.query` внутри DI-функции нарушает слоистую архитектуру. Инфраструктурный SQL-запрос должен быть в repo-слое.

**Рекомендация:** Добавить метод `getPhoneByUserId(userId)` в `pgUserByPhone` или `pgUserProjection` и использовать его здесь.

---

### 🟡 ARCH-03 — `clientProfile.appointmentStats` содержит заглушки

**Файл:** `apps/webapp/src/modules/doctor-clients/service.ts`, строки 88–93

```ts
appointmentStats: {
  total: appointments.length,      // ← количество будущих записей, не всех
  cancellations30d: 0,             // ← всегда 0, не вычисляется
  lastVisitLabel: null,            // ← всегда null
  nextVisitLabel: nextLabel,
},
```

`cancellations30d: 0` — некорректные данные отображаются в карточке клиента у врача.

**Рекомендация:**
- `cancellations30d`: вычислять из `appointmentHistory` (записи со статусом `canceled` + `last_event NOT IN (...)` за 30 дней).
- `lastVisitLabel`: найти последнюю запись из `appointmentHistory` с прошедшей датой.
- `total`: переименовать в `futureCount` или вычислять из истории.

---

### 🟡 ARCH-04 — `relayOutbound` — заглушка при наличии `INTEGRATOR_API_URL`

**Файл:** `apps/webapp/src/modules/messaging/relayOutbound.ts`

```ts
export async function maybeRelayOutbound(_info): Promise<void> {
  if (!env.INTEGRATOR_API_URL?.trim()) {
    // warn once and return
    return;
  }
  // TODO: POST к существующему API integrator при появлении контракта доставки чата.
}
```

Если `INTEGRATOR_API_URL` задан, функция проходит мимо early-return и падает в `// TODO` (завершается без действия). Молчаливо. Webapp-сообщения сохраняются в БД, но пациенты **не получают уведомлений** в Telegram/Max.

**Рекомендация:** Либо реализовать relay, либо добавить явный `console.warn` что relay-контракт не реализован даже при заданном URL, чтобы это не было незаметно в проде.

---

### 🟡 ARCH-05 — `clients/page.tsx`: detail-панель скрыта на мобильном, но отрисовывается

**Файл:** `apps/webapp/src/app/app/doctor/clients/page.tsx`, строка 58

```tsx
<div id="doctor-clients-detail-column" className="hidden md:block">
  <ClientProfileCard ... />  // ← полный серверный рендер с 7 DB-запросами на мобильном
</div>
```

На мобильных устройствах панель деталей CSS-скрыта (`hidden`), но Next.js всё равно выполняет серверный рендер с 7 параллельными БД-запросами. На мобильном пользователь никогда не видит эти данные.

**Рекомендация:** Не рендерить `<ClientProfileCard>` если `!selected || window.innerWidth < 768`. На сервере можно ориентироваться на User-Agent или убрать серверный рендер в пользу клиентского lazy-load.

---

## 4. КАЧЕСТВО КОДА

### 🟢 QA-01 — `console.log` в продовом коде

**Файл:** `apps/webapp/src/app/api/auth/telegram-init/route.ts`, строки 9, 13, 24

```ts
console.log("[auth/telegram-init] POST request received");
```

Четыре `console.log` в production-маршруте. Логируют размер `initData` (`initData.length`).

**Рекомендация:** Заменить на `console.info` с условием `if (process.env.NODE_ENV !== "production")`, либо убрать — маршрут уже логирует через стандартный Next.js request logging.

---

### 🟢 QA-02 — `buildAppDeps()` вызывается 57 раз — нет мемоизации в рамках запроса

Grep показывает 57 вызовов `buildAppDeps()` в API-маршрутах. При каждом вызове создаётся новый объект со всеми сервисами. В рамках одного HTTP-запроса это окей (Next.js server actions/routes — один вызов на маршрут), но стоит отметить, что если один API-route вызывает несколько action-функций, каждая из которых делает `buildAppDeps()` — будут дублирующиеся объекты.

**Рекомендация:** Для server actions внутри одного запроса использовать `React.cache()` или `next/cache` для дедупликации.

---

### 🟢 QA-03 — `getQuoteForDay` использует `daySeed` и сразу перезаписывает ключ

**Файл:** `apps/webapp/src/modules/patient-home/newsMotivation.ts`, строки 61–62

```ts
const dayKey = new Date().toISOString().slice(0, 10); // текущая дата
const h = createHash("sha256").update(`${daySeed}:${dayKey}`).digest();
```

Параметр `daySeed` (userId или `"guest"`) комбинируется с `dayKey`. Но `dayKey` получается из `new Date()` внутри функции, не из `daySeed`. Значит разные пользователи (разные `daySeed`) видят разные цитаты в один день, что вероятно задумано. Но нет теста, подтверждающего это поведение.

**Рекомендация:** Добавить unit-тест стабильности цитаты за день (уже в `newsMotivation.test.ts` нужно проверить `daySeed !== "guest"` и `same-day-seed → same-quote`).

---

### 🟢 QA-04 — `DoctorClientsPanel`: поиск включается только с 3+ символов (без обратной связи)

**Файл:** `apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx`, строки 42–47

```ts
if (q.length >= 3) {
  list = list.filter((c) => matchesSearch(c, q));
}
```

При вводе 1–2 символов список не фильтруется, но нет визуальной подсказки пользователю что «нужно ещё N символов».

**Рекомендация:** Добавить `{search.length > 0 && search.length < 3 && <p className="text-xs text-muted-foreground">Введите ещё {3 - search.length} симв.</p>}`.

---

### 🟢 QA-05 — `doctorSupportMessagingService.getMessages`: игнорирует `limit` параметра

**Файл:** `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts`, строка 22

```ts
const messages = await port.listMessagesSince(conversationId, {
  sinceCreatedAt: params.sinceCreatedAt ?? null,
  limit: params.limit ?? 100,
});
```

В вызове `listMessagesSince` лимит передаётся — это хорошо. Но `getConversationWithMessages` выше (строка 20) загружает все сообщения без лимита. После рефакторинга (PERF-01) этот код исчезнет, но до тех пор — дублирование.

---

### 🟢 QA-06 — Отсутствует валидация UUID для `selected` в `clients/page.tsx`

**Файл:** `apps/webapp/src/app/app/doctor/clients/page.tsx`, строка 28

```ts
const selected = params.selected; // URL query param без UUID-валидации
```

При передаче `?selected=not-a-uuid` вызов `deps.doctorClients.getClientProfile("not-a-uuid")` дойдёт до БД с невалидным UUID, что приведёт к PostgreSQL-ошибке `invalid input syntax for type uuid` (поглощается в `catch` или не обрабатывается).

**Рекомендация:**
```ts
const selected = params.selected;
if (selected && !z.string().uuid().safeParse(selected).success) {
  redirect("/app/doctor/clients");
}
```

---

## 5. НЕЗАВЕРШЁННЫЕ ФУНКЦИИ / СТАБЫ

### 🟠 STUB-01 — `reminders/service.ts`: модуль полностью-заглушка

`listReminderRules` всегда возвращает `[]`. Экрана `/app/patient/reminders` нет. Нет миграций. Нет UI для управления напоминаниями.

**Статус:** Этап 12 не реализован. Нужна отдельная задача.

---

### 🟠 STUB-02 — Relay outbound в messaging (см. ARCH-04)

Сообщения из webapp-чата хранятся в БД, но пациенты в Telegram/Max не получают уведомлений.

---

### 🟠 STUB-03 — OAuth Yandex (этап 5.5) не реализован

`/api/auth/oauth/callback` → редирект на `?oauth=pending`. CSRF-защита через `state` не реализована.

---

### 🟡 STUB-04 — LFK упражнения/шаблоны/назначения (этапы 11)

Модули `lfk-exercises`, `lfk-templates`, `lfk-assignments` не существуют. UI для врача-назначения упражнений пациенту отсутствует.

---

### 🟡 STUB-05 — Settings/Admin (этап 14)

`/app/settings` — чистый redirect. Нет таблицы `system_settings`, нет admin mode, нет управления `sms_fallback_enabled`, `debug_forward_to_admin`.

---

## 6. ТЕСТОВЫЕ ПРОБЕЛЫ

### 🟡 TEST-01 — Нет тестов для key security paths

| Маршрут | Пропущенный сценарий |
|---------|---------------------|
| `POST /api/patient/messages` | 403 при заблокированном пользователе |
| `GET /api/patient/messages` | polling success (only 404 "чужого" покрыт) |
| `POST /api/patient/messages/read` | ownership check |
| `GET /api/doctor/messages/unread-count` | нет теста |
| `POST /api/doctor/messages/[id]/read` | нет теста |
| `PATCH /api/admin/users/[id]/archive` | попытка от role=doctor (должен быть 403) |

---

### 🟡 TEST-02 — `useMessagePolling` не покрыт тестами поведения

**Файл:** `apps/webapp/src/modules/messaging/hooks/useMessagePolling.test.ts`

```ts
describe("useMessagePolling", () => {
  it("exports hook function", async () => {
    const mod = await import("./useMessagePolling");
    expect(typeof mod.useMessagePolling).toBe("function");
  });
});
```

Единственный тест — проверка экспорта. После рефакторинга поведение (пауза при hidden, возобновление при visible) не верифицировано автоматически.

**Рекомендация:** Добавить тесты с mock `document.visibilityState` через `jsdom`.

---

### 🟡 TEST-03 — `pgDoctorAppointments.ts` — нет теста для исправленного запроса отмен

После правки (FIX_PLAN_STAGE_01): `getDashboardAppointmentMetrics` теперь исключает `event-remove-record`. Нет теста, который проверяет это правило.

**Рекомендация:** В `doctor-stats/*.test.ts` добавить фикстуру с записями `status=canceled, last_event=event-remove-record` и проверить что они НЕ попадают в `cancellationsInMonth`.

---

## 7. ОБОБЩЁННАЯ ТАБЛИЦА ПРИОРИТЕТОВ

| ID | Файл | Приоритет | Тип |
|----|------|-----------|-----|
| SEC-01 | `modules/auth/service.ts` | 🔴 CRITICAL | Безопасность |
| SEC-02 | `modules/auth/service.ts` | 🔴 CRITICAL | Безопасность |
| SEC-03 | `modules/auth/check*RateLimit.ts` | 🟠 HIGH | Безопасность |
| SEC-04 | `api/media/upload/route.ts` | 🟠 HIGH | Безопасность |
| SEC-05 | `api/auth/messenger/start/route.ts` | 🟠 HIGH | Безопасность |
| SEC-06 | `api/auth/oauth/callback/route.ts` | 🟡 MEDIUM | Безопасность |
| SEC-07 | `modules/auth/service.ts` | 🟡 MEDIUM | Безопасность |
| PERF-01 | `modules/messaging/doctorSupportMessagingService.ts` | 🟠 HIGH | Производительность |
| PERF-02 | `modules/doctor-stats/service.ts` | 🟠 HIGH | Производительность |
| PERF-03 | `app/app/patient/page.tsx` | 🟠 HIGH | Производительность |
| PERF-04 | `app-layer/di/buildAppDeps.ts` | 🟡 MEDIUM | Производительность |
| PERF-05 | `modules/patient-home/newsMotivation.ts` | 🟡 MEDIUM | Производительность |
| PERF-06 | `app/app/doctor/clients/page.tsx` | 🟡 MEDIUM | Производительность |
| ARCH-01 | `shared/ui/PatientHeader.tsx`, `DoctorHeader.tsx` | 🟡 MEDIUM | Архитектура |
| ARCH-02 | `app-layer/di/buildAppDeps.ts` | 🟡 MEDIUM | Архитектура |
| ARCH-03 | `modules/doctor-clients/service.ts` | 🟡 MEDIUM | Корректность |
| ARCH-04 | `modules/messaging/relayOutbound.ts` | 🟡 MEDIUM | Функционал |
| ARCH-05 | `app/app/doctor/clients/page.tsx` | 🟡 MEDIUM | Производительность |
| STUB-01 | `modules/reminders/service.ts` | 🟠 HIGH | Незавершено |
| STUB-02 | `modules/messaging/relayOutbound.ts` | 🟠 HIGH | Незавершено |
| STUB-03 | `api/auth/oauth/callback` | 🟡 MEDIUM | Незавершено |
| STUB-04 | LFK модули | 🟡 MEDIUM | Незавершено |
| STUB-05 | Settings/Admin | 🟡 MEDIUM | Незавершено |
| TEST-01 | API routes | 🟡 MEDIUM | Тесты |
| TEST-02 | `useMessagePolling.test.ts` | 🟡 MEDIUM | Тесты |
| TEST-03 | `pgDoctorAppointments` | 🟡 MEDIUM | Тесты |
| QA-01 | `telegram-init/route.ts` | 🟢 LOW | Качество |
| QA-02 | `buildAppDeps.ts` | 🟢 LOW | Качество |
| QA-03 | `newsMotivation.ts` | 🟢 LOW | Качество |
| QA-04 | `DoctorClientsPanel.tsx` | 🟢 LOW | UX |
| QA-05 | `doctorSupportMessagingService.ts` | 🟢 LOW | Качество |
| QA-06 | `clients/page.tsx` | 🟢 LOW | Надёжность |

---

## 8. РЕКОМЕНДОВАННЫЙ ПОРЯДОК РАБОТЫ

1. **Сначала**: SEC-01, SEC-02 — исправления без сайд-эффектов, high impact.
2. **Затем**: PERF-01 + PERF-02 — быстрые wins на производительности.
3. **Параллельно**: PERF-03 (`incrementNewsViews` → fire-and-forget) — одна строка.
4. **В рамках следующего этапа**: ARCH-03 (заглушки в `appointmentStats`), TEST-03.
5. **Отдельные задачи**: STUB-01 (Reminders), STUB-02 (Relay), STUB-04 (LFK), STUB-05 (Settings).

---

*Аудит выполнен статически. Для подтверждения PERF-метрик рекомендуется профилирование на staging с реальными объёмами данных.*
