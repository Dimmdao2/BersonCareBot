# Коррекция этапа A, круг 4 — закрытие `R3-1` и `R3-2`

**Дата:** 2026-08-22. **Ветка:** `wt/therapysto-stage-a-20260822`. **Закрываемый вердикт:**
`AUDIT_STAGE_A_ROUND3_2026-08-22.md` (коммит `d1556e259`). **План:** `IMPLEMENTATION_PLAN.md`, этап `A`,
`TPB-08`, `TPB-16`, Gate A.

Круг узкий: два дефекта вердикта круга 3 и обход staff-входов, которого требовал бриф. Механизм не
перестраивался — он признан аудитом настоящим, менялись правила в существующей таблице и место, откуда
гейт берёт matcher.

Изменено три файла:

| Файл | Что |
| --- | --- |
| `apps/webapp/src/proxy.ts` | комментарий: `config.matcher` объявлен единственным источником; записан замер, почему это литерал |
| `apps/webapp/src/config/surfaceRoutes.ts` | удалена вторая копия matcher'а (`isSurfaceHeaderCarryingPath`); добавлены два правила `query` для `/app/contact-support` |
| `apps/webapp/src/config/surfaceRoutes.unit.test.ts` | гейт строит предикат накрытия из `config.matcher` самого proxy; +6 тестов |

---

## `Z1` (`R3-2`) — гейт больше не слеп к matcher'у

**Что было.** Факт «на каких путях proxy проставляет заголовок пути» был записан дважды: литералом в
`proxy.ts` (`config.matcher`) и литералом в `surfaceRoutes.ts:201` (`isSurfaceHeaderCarryingPath`). Тест
покрытия читал вторую копию, поэтому правка первой — того самого шва, на котором стоит идентичность
поверхности, — гейт не краснила.

**Сведение к одному источнику.** Источник — `config.matcher` в `proxy.ts`. Копия из `surfaceRoutes.ts`
удалена; гейт импортирует `config` из proxy и строит предикат накрытия из ЕГО значения
(`matcherPatternToRegExp` — поддержан ровно используемый синтаксис Next, на любом другом бросает, чтобы
новая строка matcher'а не прошла мимо гейта молча).

**Почему источник именно в `proxy.ts`, а не наоборот (замер, а не рассуждение).** Аудит предлагал
«строить matcher из одного источника, а не переписывать литералом» — направление зависимости задаёт Next:
он читает `config` статическим разбором исходника. Вынес список в константу ЭТОГО ЖЕ файла и собрал:

```
# правка: const PROBE_MATCHER = [...]; matcher: PROBE_MATCHER
NODE_ENV=production pnpm exec next build
→ build exit: 1
→ Error: Turbopack build failed with 1 errors:
  Next.js can't recognize the exported `config` field in route. `matcher` needs to be a static string
  or array of static strings or array of static objects.
```

То есть импортированная константа невозможна, а попытка её ввести роняет сборку громко, а не молча.
Правка возвращена; после возврата `next build` → exit 0 и Next читает ровно четыре строки:

```
node -e "const m=require('./.next/server/functions-config-manifest.json');
         console.log(JSON.stringify(m.functions['/_middleware'].matchers.map(x=>x.originalSource)))"
→ ["/","/app","/app/:path*","/api/:path*"]
```

(В Next 16.2.11 matcher'ы лежат в `functions-config-manifest.json`; `middleware-manifest.json` пуст.)

**`V1` — проверено инъекцией, а не рассуждением.**

```
# исходное состояние
pnpm exec vitest --run --project=unit src/config/surfaceRoutes.unit.test.ts
→ Test Files 1 passed (1) · Tests 39 passed (39)

# инъекция: matcher: ['/', '/app', …] → ['/app', …]   (ровно инъекция аудитора круга 3)
pnpm exec vitest --run --project=unit src/config/surfaceRoutes.unit.test.ts
→ Test Files 1 failed (1) · Tests 2 failed | 35 passed (37)
  ✗ каждый staff-маршрут накрыт matcher-ом proxy — expected [ '/' ] to deeply equal []
  ✗ маршруты вне matcher proxy классифицированы как patient — expected [ '/' ] to deeply equal []

# правка возвращена
→ Test Files 1 passed (1) · Tests 39 passed (39)   (37 на момент инъекции — до правил Z2)
```

Инъекция, которая в круге 3 оставляла 33/33 зелёными, теперь краснит гейт двумя тестами и называет
виновный маршрут.

**Защита от вырождения предиката** (чтобы конвертер не начал «накрывать всё» и не сделал проверку
пустой) — отдельный тест: дерево обязано делиться на накрытые и не накрытые, `/` не накрывает `/app`,
`/app/:path*` накрывает `/app` и `/app/doctor/login` и не накрывает `/legal/terms`, неподдержанный
синтаксис бросает.

---

## `Z2` (`R3-1`) — `?from=clinic-demo` отдаёт Therapysto

Одна строка правила в существующей таблице, механизм `query` уже был:

```ts
{ match: { kind: 'prefix', path: '/app/contact-support' },
  query: { key: 'from', value: 'clinic-demo' }, surface: 'staff', … }
```

**`V2`, живой прогон (dev-сервер этого клона на 5340, дефолтный env; порт 5200 не тронут):**

| URL | title | manifest | apple-title | иконка | тело |
| --- | --- | --- | --- | --- | --- |
| `/` | `Therapysto — кабинет специалиста` | `manifest-staff` | `Therapysto` | staff | `Therapysto`×17, `Therapygo`×0 |
| `/app/contact-support?from=clinic-demo` | `Therapysto` | `manifest-staff` | `Therapysto` | staff | `Therapysto`×9, `Therapygo`×0 |
| `/app/contact-support` (без параметра) | `Therapygo` | `manifest` | `Therapygo` | patient | `Therapysto`×0, `Therapygo`×9 |
| `/app/contact-support?from=login` | `Therapygo` | `manifest` | `Therapygo` | patient | `Therapysto`×0, `Therapygo`×9 |
| `/app/contact-support?from=verify` | `Therapygo` | `manifest` | `Therapygo` | patient | `Therapysto`×0, `Therapygo`×9 |

Пациентская форма поддержки без параметра не задета — ни в метаданных, ни в видимом тексте.

**Тот же путь живым браузером — кликом по CTA, а не адресной строкой** (headless Chromium 1228 по CDP;
`document.body.innerText`, то есть видимые строки):

```
hard  /                     → title «Therapysto — кабинет специалиста», manifest-staff,
                              apple Therapysto, icon /staff-pwa-icon-192.png, шапка «Therapysto»
soft  клик «Запросить демо» → /app/contact-support?from=clinic-demo
                              title «Therapysto», manifest-staff, apple Therapysto,
                              icon staff, видимая шапка «Therapysto», Therapygo×0
контроль:
hard  /app/patient/login    → «Therapygo», manifest.webmanifest, шапка «Therapygo»
soft  клик «Связь с поддержкой» → /app/contact-support
                              «Therapygo», manifest.webmanifest, шапка «Therapygo», Therapysto×0
```

---

## `V3` — обход staff-входов (не дерева маршрутов)

Метод по требованию брифа: список входов получен ИЗМЕРЕНИЕМ со staff-поверхности, ожидаемая поверхность
не бралась из проверяемой таблицы — смотрел, куда попадает человек и что он там видит.

**Как получен список (три источника, каждый — командой):**

```
# 1. Лендинг Therapysto (маршрут «/»): все ссылки
grep -rnoE 'href=(\{?)"[^"]+"' apps/webapp/src/components/landing/        → 20 вхождений, 9 разных целей
grep -rnE "router\.(push|replace)|window\.location|redirect\(" apps/webapp/src/components/landing/
                                                                          → +1 цель (StandaloneRootRedirect)

# 2. Экраны входа персонала: чем ссылается общий AuthFlowV2 (его же рендерят /app/doctor/login и /app/admin/login)
grep -rn "contact-support" apps/webapp/src --include=*.tsx --include=*.ts | grep -v "app/contact-support/"
grep -rn "withContactSupportReturn" apps/webapp/src                       → значения from: staff-factor, verify

# 3. Письма персоналу и приглашения: пути, которые они кладут в ссылку
grep -rnoE "'/(app|book|join|legal)[^']*'|\`/(app|book|join|legal)[^\`]*\`" \
  apps/webapp/src/modules/auth/emailAuth.ts apps/webapp/src/modules/specialist-tasks/* \
  apps/webapp/src/modules/messaging/*.ts apps/webapp/src/modules/saas-billing/service.ts \
  apps/webapp/src/modules/operator-alerts/*.ts apps/webapp/src/app/api/clinic/invites/route.ts
```

**Результат прохода (живой сервер 5340, `curl -L`, редиректы пройдены):**

| Вход (откуда) | Цель | Куда попал | Что видит человек |
| --- | --- | --- | --- |
| лендинг, 5 CTA «Создать кабинет» | `/app?intent=specialist` | тот же | `Therapysto`×10, `Therapygo`×0 ✅ |
| лендинг, 4 CTA «Демо для клиники» / «Запросить демо» | `/app/contact-support?from=clinic-demo` | тот же | `Therapysto`×9, `Therapygo`×0 ✅ **починено этим кругом** |
| лендинг, футер «Связь с поддержкой» | `/app/contact-support` | тот же | `Therapygo` ⚪ сигнала в URL нет — случай голого `/app`, закрыт владельцем 22.08 |
| лендинг, 5 ссылок «Войти» | `/app` | тот же | `Therapygo` ⚪ тот же закрытый владельцем случай |
| лендинг, футер | `/legal/privacy`, `/legal/terms` | те же | title «… · Therapysto», manifest пациентский ⚪ по правилу таблицы: общий текст обеих поверхностей, имя из `PLATFORM_NAME` |
| лендинг, логотип | `/` | тот же | `Therapysto` ✅ |
| установленное пациентское PWA на корне | `/app/patient` (`StandaloneRootRedirect`) | `/app/patient/login` | `Therapygo` ✅ это пациентский вход, не staff |
| экран входа персонала | `/app/doctor/login`, `/app/admin/login` | те же | `Therapysto`×10, `Therapygo`×0 ✅ |
| **шаг второго фактора персонала**, «Нет доступа к приложению и резервным кодам» | `/app/contact-support?from=staff-factor` | тот же | `Therapysto`×9, `Therapygo`×0 ✅ **найдено этим обходом, см. ниже** |
| экран входа, общий AuthFlowV2 обеих аудиторий | `?from=verify`, `?from=login`, `?from=reset` | тот же | `Therapygo` ⚪ значение ставится и пациенту, и персоналу — staff-сигналом не является |
| письмо-приглашение ПЕРСОНАЛА | `/app/clinic/invites/accept?token=` | тот же | `Therapysto`×7, `Therapygo`×0 ✅ |
| напоминание специалисту о задаче | `/app/doctor#…`, `/app/doctor/clients/…` | `/app/doctor/login?next=…` | `Therapysto`×10 ✅ |
| уведомление врачу о сообщении/заметке | `/app/doctor/…` | `/app/doctor/login?next=…` | `Therapysto`×10 ✅ |
| operator-alert админу | `/app/admin/technical` | `/app/admin/login?next=…` | `Therapysto`×10 ✅ |
| письма биллинга/команды | `/app/settings?tab=billing`, `?tab=team` | **`/app`** | `Therapygo` ⚠️ см. ниже |
| личная область сотрудника | `/app/account` | **`/app`** | `Therapygo` ⚠️ то же |
| лендинг и футер | `https://dmitryberson.ru` | внешний сайт | вне периметра |

### Одно исправление сверх двух пунктов брифа — называю явно

`/app/contact-support?from=staff-factor` отдавал пациентскую идентичность. Это ровно класс `R3-1`: URL
достижим ТОЛЬКО с staff-поверхности (шаг `staff_factor` в `AuthFlowV2` — TOTP/резервный код персонала,
`modules/auth/staffLoginContinuation.ts`), сигнал в URL различим, и требование то же — `TPB-08`. Закрыт
той же одной строкой правила, никакой новой машинерии. Сделал, а не оставил вопросом, потому что находка
получена ровно тем измерением, которое бриф предписал провести, и в плане владельца её требование есть
(`TPB-08`). Если ведущий считает это выходом за узкий круг — снимается откатом одной строки
(`surfaceRoutes.ts`, правило с `value: 'staff-factor'`) и двух тестовых строк.

### Что оставлено сознательно

- **`R3-3` (`SHOULD FIX`) — подделка `x-bc-pathname` вне matcher'а. Не трогал по прямому указанию брифа:**
  последствие косметическое, третьим лицом не эксплуатируется, правильное место — этап `B`, где
  поверхность будет резолвиться по `Host`.
- **`R3-4` (`NICE FIX`) — `apps/webapp/src/config/config.md:12` предписывает удалённый хук
  `usePatientSurfaceName()` (сейчас `useSurfaceName()`).** В два пункта круга не входит; называю адрес,
  чтобы правка стоила одного слова, когда ведущий решит.
- **`/app/settings?tab=billing`, `?tab=team`, `/app/account` без сессии редиректят на `/app`** —
  сотрудник по ссылке из письма о биллинге попадает на общий вход с пациентской идентичностью. Это НЕ
  новый класс: это ровно голый `/app`, который владелец закрыл 22.08 дословно («предлагаю никак — я сразу
  дам оба домена»). Работу из этого не вывожу; фиксирую, потому что решение владельца принималось про
  лендинг, а этим обходом видно, что тот же экран получают и по staff-письму. Если после переезда на два
  домена случай не исчезнет сам — это вход для этапа `B`, а не правка таблицы.
- **Продуктовый вопрос круга 3 остаётся вопросом:** должна ли заявка «Демо для клиники» вообще вести на
  форму «Сообщение уйдёт администратору» и должна ли ссылка «К входу» с неё вести на `/app`. Идентичность
  экрана починена; куда он ведёт дальше — решение владельца, не дефект идентичности.

---

## `V4` — гейты

```
pnpm exec tsc --noEmit                                              → exit 0
pnpm exec eslint src/proxy.ts src/config/surfaceRoutes.ts \
                 src/config/surfaceRoutes.unit.test.ts              → exit 0
NODE_ENV=production pnpm exec next build                            → exit 0
pnpm exec vitest --run --project=unit \
  src/config/surfaceRoutes.unit.test.ts \
  src/shared/lib/pwa/staffPwaManifest.unit.test.ts                  → 2 files, 42 tests passed
pnpm exec vitest --run --project=route src/proxy.route.test.ts      → 1 file, 13 tests passed
```

Затронутые тесты выбраны измерением, а не на глаз:
`grep -rln "surfaceRoutes\|surfaceLayoutMetadata\|resolveRequestSurface\|getRequestSurface\|staffPwaLayoutMetadata" src/ --include="*.test.ts*"`
→ ровно два файла; плюс `proxy.route.test.ts` как единственный потребитель `@/proxy`.

Все живые прогоны — dev-сервер ЭТОГО клона на 5340, остановлен (`ss -ltn | grep ':53[0-9][0-9]'` → пусто).
Порт 5200 не трогал, чужой сервер на нём жив. PROD/TEST/БД/деплой/push не трогал.
