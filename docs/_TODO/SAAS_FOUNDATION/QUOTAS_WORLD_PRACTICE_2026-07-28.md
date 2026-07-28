# Квоты и механики: мировая практика и готовые движки

**Дата среза:** 2026-07-28

**Статус:** исследование перед реализацией пунктов §10.3–10.7

**Карточка:** #1069

**Результат:** одна рекомендация — на текущем масштабе оставить собственный PostgreSQL-backed
`TariffQuota` / mechanics registry, добавить собственный append-only журнал потребления и не ставить внешний
движок. Основания и условия пересмотра — ниже.

## 0. Рамка и локальные источники истины

Это дополнение к
[`QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md`](QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md), а не его замена.
Исследование отвечает только на внешний research-gate перед
[`OWNER_PUNCHLIST_2026-07-28.md`](../OWNER_PUNCHLIST_2026-07-28.md) §10.3–10.7.

Локальный предмет исследования:

1. **Признак наличия** — branding, domain, today, warmups, promo.
2. **Текущий запас** — карточки пациентов, курсы, места, CMS-страницы, подписки.
3. **Потребление за период** — рассылки, платежи.
4. **Объём** — файлы пациентов.

Метод следует
[`OWNER_PRODUCT_RULES.md`](../../ARCHITECTURE/OWNER_PRODUCT_RULES.md) §9 и §32: WHAT берётся из практики,
готовый компонент оценивается не только по лицензии, но и по надёжности, совместимости с одним
Node.js + PostgreSQL сервером и удобству владельцу. Внешние факты ниже взяты из официальной документации,
репозиториев, changelog/release pages и реальных русскоязычных тарифных интерфейсов. Там, где вывод является
нашей интерпретацией источников, он так и назван.

## 1. Потребление за период

### Вопрос

Нужен ли сначала журнал событий, затем подсчёт; обязателен ли idempotency key; к чему привязан период;
что делать с лимитом при смене тарифа посреди периода?

### Что делает практика

#### 1.1. Пять систем

| Система | Запись и подсчёт | Идемпотентность и время | Период и смена плана |
|---|---|---|---|
| Stripe Billing Meters | Meter event представляет отдельную единицу использования; meter агрегирует события за billing period. | Событие несёт customer, value, event name, timestamp и optional unique identifier для idempotency. [Stripe: lifecycle и состав meter event](https://docs.stripe.com/billing/subscriptions/usage-based/how-it-works) | Базовая модель привязана к billing cycle subscription; usage агрегируется к счёту периода. Stripe отдельно различает денежную prorating и usage. [Billing cycle anchor](https://docs.stripe.com/billing/subscriptions/billing-cycle) |
| Lago | Приложение отправляет события, Lago сопоставляет их с подпиской, дедуплицирует и агрегирует в счёт. Рекомендуется одно событие на billable action. | `transaction_id` обязателен и генерируется источником; одинаковое событие учитывается один раз. `timestamp` относит событие к правильному периоду, включая late arrivals. [Lago: ingest usage](https://getlago.com/docs/guide/events/ingesting-usage) | Поддерживает оба якоря: `anniversary` от даты подключения и `calendar` от начала календарного периода; `calendar` — default. Upgrade применяется сразу, downgrade — в конце периода. [Subscription object](https://getlago.com/docs/api-reference/subscriptions/subscription-object), [upgrades/downgrades](https://getlago.com/docs/guide/subscriptions/upgrades-downgrades) |
| OpenMeter | Usage events принимаются в CloudEvents и превращаются meter-агрегацией в usage; entitlement хранит usage, balance и overage. | Дедупликация идёт по паре CloudEvents `source + id`. [Usage events](https://openmeter.io/docs/concepts/usage-events) | Документация рекомендует согласовывать usage period с billing cycle. Для downgrade рекомендует next cycle, для upgrade — immediate. При partial edit меняется limit, но usage считается за **весь** текущий billing period; отдельно можно перезапустить цикл и сбросить entitlements. [Entitlement](https://openmeter.io/docs/billing/entitlements/entitlement), [subscription edit](https://openmeter.io/docs/billing/subscription/edit) |
| Orb | Принимает raw event, хранит его и считает usage при биллинге. | `idempotency_key` и `timestamp` обязательны; повтор с тем же ключом безопасен. [Orb ingest API](https://docs.withorb.com/api-reference/event/ingest-events) | Plan allocation начисляется в начале billing period. Orb прямо говорит: объём allocation **не prorate-ится** по длине укороченного периода и раннее окончание не отбирает пропорциональную часть. Plan allocation сгорает при смене плана, отдельно купленные credits сохраняются. [Orb prepaid credits and allocations](https://docs.withorb.com/product-catalog/prepurchase) |
| Metronome | Raw usage events поступают в billing engine и агрегируются billable metrics. Документация требует собственную надёжную очередь и retry, а не синхронную зависимость критического пути от Metronome. | `transaction_id`, customer, timestamp и event type обязательны; дубли с тем же ID игнорируются 34 дня; failed ingest безопасно повторяется. [Send usage events](https://docs.metronome.com/guides/implement-metronome/core-concepts/send-usage-events), [API idempotency](https://docs.metronome.com/api-reference/idempotency) | Credits/commits имеют явный `access_schedule` с диапазонами дат и суммами; тем самым изменение allowance моделируется новой временной ступенью, а не неявной формулой. [Credits and commits](https://docs.metronome.com/guides/pricing-packaging/apply-credits-and-commits/create-a-pre-paid-commit) |

#### 1.2. Консенсус

1. **Сначала факт, потом агрегат.** Зрелые системы принимают usage event, сохраняют/проводят его через
   журнал и уже из событий считают meter. Прямое изменение одного счётчика без исходного факта лишает систему
   retry, reconciliation и аудита. Это одинаково видно у
   [Stripe](https://docs.stripe.com/billing/subscriptions/usage-based/how-it-works),
   [Lago](https://getlago.com/docs/guide/events/ingesting-usage),
   [OpenMeter](https://openmeter.io/docs/concepts/usage-events),
   [Orb](https://docs.withorb.com/api-reference/event/ingest-events) и
   [Metronome](https://docs.metronome.com/guides/implement-metronome/core-concepts/send-usage-events).

2. **Ключ повторяемости создаёт источник.** Название поля отличается (`transaction_id`,
   `idempotency_key`, CloudEvents `source + id`), но смысл один: повтор сетевого запроса не создаёт новое
   потребление. Stripe разрешает identifier не передавать, остальные рассматриваемые системы требуют его.
   Для нашей внутренней системы безопаснее более строгий общий знаменатель — обязательный deterministic key.

3. **Время события — бизнес-время факта, не время доставки.** Оно определяет период; late event должен попасть
   в тот период, когда использование произошло. Это прямо зафиксировано у
   [Lago](https://getlago.com/docs/guide/events/ingesting-usage) и
   [Metronome](https://docs.metronome.com/guides/implement-metronome/core-concepts/send-usage-events);
   Stripe для late usage предлагает invoice finalization grace period
   ([Stripe grace period](https://docs.stripe.com/billing/subscriptions/usage-based/configure-grace-period)).

4. **Денежная prorating и allowance — разные сущности.** Документация может prorate-ить цену, но это не означает
   пропорционального пересчёта доступных единиц. OpenMeter меняет limit при сохранении usage всего периода,
   Orb выдаёт полный allocation даже для короткого цикла, Metronome требует явных дат и сумм.

#### 1.3. Где практика разделена

- **Anniversary против calendar.** Единого обязательного стандарта нет: Lago официально поддерживает оба.
  Subscription-oriented системы естественно считают по billing cycle; календарный месяц удобнее бухгалтерской
  сверкой и общими пакетными отчётами, но создаёт укороченный первый период и требует объяснить prorating.
- **Немедленная смена против next cycle.** Практика заметно асимметрична: upgrade обычно immediate, downgrade
  обычно next cycle. Это прямо рекомендуют
  [OpenMeter](https://openmeter.io/docs/billing/subscription/edit),
  [Lago](https://getlago.com/docs/guide/subscriptions/upgrades-downgrades) и
  [Mailchimp](https://mailchimp.com/help/change-or-pause-your-pricing-plan/).
- **Allowance при immediate upgrade.** Универсальной автоматической формулы нет. Реальные механизмы —
  применить новый limit к usage всего периода, выдать полный новый allocation, задать отдельный access schedule
  либо начать новый cycle. То есть выбор является продуктовой политикой, а не технической неизбежностью.

### Что это значит для нас

**§10.3 закрыт исследованием.** Нужен append-only `usage_event`-журнал:

- `organization_id`;
- стабильный `metric_key`;
- `quantity` и `unit`;
- `occurred_at`;
- обязательный `idempotency_key`, уникальный в определённом scope;
- `source` / `source_entity_id` для расследования;
- metadata без медицинских данных, если они не нужны для тарификации;
- агрегат считается запросом/проекцией из журнала, а не является единственной истиной.

Для наших двух period-consumption механик это означает:

- рассылка создаёт событие по принятому к отправке billable action, а retry доставки не создаёт новое usage;
- платёж создаёт событие от устойчивого business ID операции, а повтор webhook/API не увеличивает usage.

**§10.4 получает рекомендуемый WHAT:**

- period anchor — текущий subscription/billing cycle организации, не `date_trunc('month')`;
- immediate upgrade — новый полный limit применяется к уже накопленному usage текущего цикла, usage не
  сбрасывается и allowance не режется пропорционально дням;
- downgrade — с начала следующего цикла;
- отдельная осознанная операция «начать новый цикл сейчас» может одновременно сменить anchor и сбросить usage,
  но не должна быть побочным эффектом обычного редактирования тарифа.

Это также безопасно закрывает owner fork D9: новая квота применяется к накопленному usage текущего периода.
Если накоплено 80, а limit повысили с 100 до 200, остаётся 120. Если limit немедленно снизили до 50, история
не переписывается: usage остаётся 80, состояние становится over-limit.

## 2. Поведение на лимите

### Вопрос

Должны ли snapshot capacity, stored volume, outbound messages и seats вести себя одинаково: hard block,
grace, overage или throttle?

### Что делает практика

| Вид ресурса | Наблюдаемая практика | Почему это не одно и то же |
|---|---|---|
| Сохранённый объём / storage | При переполнении блокируются новые uploads/creates, но остаётся вход и доступ к данным; удаление — только после очень длинного срока и уведомлений. Google блокирует новые файлы и оставляет доступ, удаление возможно лишь после 2 лет over-quota с предупреждением; Dropbox останавливает sync/upload. [Google storage](https://support.google.com/drive/answer/9312312?hl=en), [Dropbox storage](https://help.dropbox.com/storage-space/over-storage-limit) | Уже сохранённое — данные клиента. Правильный hard limit здесь означает **запрет роста**, а не удаление или read lock. |
| Исходящие сообщения: коммерческий пакет | Если есть договорённая overage-модель, mature SaaS продолжает сервис и выставляет доплату. Mailchimp прямо не прерывает service при превышении contact/send limit, а добавляет charge; downgrade действует со следующего цикла. [Mailchimp plan behavior](https://mailchimp.com/help/change-or-pause-your-pricing-plan/) | Overage — не «grace бесплатно», а отдельное коммерческое обязательство с ценой и счётом. |
| Исходящие сообщения: технический quota/rate | Amazon SES отбрасывает send при исчерпании daily quota; превышение per-second rate возвращает throttling и предполагает delayed retry. [Amazon SES quota errors](https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas-errors.html) | Period quota и rate limit — разные механизмы: quota даёт reject, rate даёт throttle/retry. |
| Seats | Лицензии сначала освобождают или уменьшение откладывают до renewal; пользователей автоматически не выбирают и не отключают. Microsoft запрещает снизить количество, пока все лицензии назначены. Notion применяет добавление сразу с prorating, а уменьшение оплачиваемых мест — в следующем cycle. [Microsoft licenses](https://learn.microsoft.com/en-us/microsoft-365/commerce/licenses/buy-licenses?view=o365-worldwide), [Notion billing](https://www.notion.com/help/billing) | Seat — это человек с доступом. Автоматическое отключение требует произвольного выбора жертвы и создаёт security/operations-инцидент. |

### Вывод: default зависит от вида ресурса

1. **Stored capacity и volume:** hard block новых creates/uploads при `used >= limit`; существующее доступно для
   просмотра, экспорта, удаления и действий, которые уменьшают usage. Никакого автоматического удаления.
2. **Snapshot business objects:** тот же «block growth, preserve existing». Например, нельзя создать новую
   карточку пациента или новую CMS-страницу, но существующие карточки не становятся недоступными.
3. **Seats:** не обычный capacity hard block. При превышении сохраняются текущие участники, блокируются invite /
   activation нового участника; снижение ниже usage либо не принимается, либо планируется на renewal и требует
   от администратора освободить места.
4. **Маркетинговая рассылка:** если у нас нет договора и цены overage, явный hard reject новой рассылки
   согласуется с практикой. Когда появится тарифицируемый overage, default можно сменить на continue + charge.
5. **Rate:** не использовать периодную квоту как rate limiter. Если появится защита канала «N сообщений в
   секунду», это отдельный throttle с очередью и retry.
6. **Критические уведомления пациентам:** не включать в маркетинговый bucket. Иначе коммерческий лимит
   способен остановить лечебный сценарий; это отдельный тип трафика и отдельная эксплуатационная гарантия.
7. **Платёж:** пропустить операцию и показать/записать предупреждение — разумное исключение. Платёж не расходует
   дорогой storage и сам является способом восстановить коммерческое состояние. Metronome отдельно советует не
   делать billing service блокером критического customer path
   ([critical-path guidance](https://docs.metronome.com/guides/implement-metronome/core-concepts/send-usage-events)).

### Что это значит для нас

Текущий design «hard block для capacity-like» соответствует практике **после уточнения семантики**:
hard block = запрет только нового роста; read/export/delete и работа с существующим остаются.

Это закрывает основу §10.6 для трёх первых механик:

- рассылки — блок запуска новой маркетинговой рассылки после исчерпания включённого количества;
- платежи — операция проходит, usage фиксируется, владелец видит over-limit warning;
- брендинг — при отсутствии entitlement нейтральный системный fallback, без поломанной страницы.

Отдельно §10.6/seat gate нельзя реализовывать тем же универсальным guard без seat-specific downgrade policy.

## 3. Словарь русского тарифного интерфейса

### Вопрос

Как развести «не включено» и «не ограничено», allowance и overage, а также период оплаты и период сброса?

### Что делает русскоязычная практика

- Российский Webim подписывает признаки как **«Включено в тариф» / «Не включено в тариф»** и количество как
  **«без ограничений»**. Это реальный тарифный UI, а не перевод
  ([Webim pricing](https://webim.ru/price/)).
- Русская документация Microsoft Marketplace использует **«количество, включённое в базовое предложение»**,
  **«неограниченно»**, **«плата за превышение использования»** и **«перерасход»**
  ([Microsoft SaaS metered billing](https://learn.microsoft.com/ru-ru/partner-center/marketplace-offers/saas-metered-billing)).
- Российский Mindbox использует формулировки **«сверх лимита»**, **«превышение»** и
  **«следующий расчётный период»**
  ([Mindbox: отчёт по тарифицируемым данным](https://help.mindbox.ru/docs/reports-billing)).

### Рекомендуемый словарь BersonCare

| Смысл | Надпись в редакторе | Надпись клиенту / в таблице тарифа | Не использовать |
|---|---|---|---|
| Boolean entitlement есть | `Включено в тариф` | `Включено в тариф` | `Есть квота` |
| Boolean entitlement нет | `Не включено в тариф` | `Не включено в тариф` | `Без квоты` |
| Unlimited | `Без ограничений` | `Без ограничений` | `Без квоты`, `0`, пустое поле |
| Included allowance | `Включено: N <единиц>` | `N <единиц> включено за расчётный период` | `Числовая` |
| Hard limit исчерпан | `Лимит исчерпан` | `Лимит исчерпан. Новое действие недоступно до …` | `Квота закончилась` без даты/способа восстановления |
| Overage разрешён и оплачивается | `Сверх лимита: X ₽ / единицу` | `Использование сверх лимита оплачивается отдельно` | `Можно превышать` без цены |
| Overage не предусмотрен | отдельного поля нет | сообщение о hard limit | `Сверх лимита: 0 ₽` |
| Частота оплаты | `Период оплаты` → `Ежемесячно / Ежегодно` | то же | просто `Период` |
| Окно usage | `Период лимита` → `Без сброса / За расчётный период` | `Сбрасывается в день продления тарифа` | второй `Месяц` |

**§10.5 закрыт по WHAT.** Два разных периода больше не называются одинаково. Для первого релиза не нужен
вариант «за календарный месяц»: выбранный ниже safe default — расчётный период организации от её billing anchor.

## 4. Готовые движки

### Вопрос

Можно ли дешевле и надёжнее заменить часть собственного `TariffQuota` / mechanics registry готовым
entitlements, authorization, feature-flag или metering engine?

### Как оценивались кандидаты

- **Функциональная полнота:** boolean entitlement, snapshot limit, period usage, overage, plan versions.
- **Надёжность:** открытый активный репозиторий/release либо SLA и documented failure behavior.
- **Runtime:** дополнительный daemon, память, Redis/Kafka/ClickHouse/отдельный UI.
- **Размещение данных:** можно ли гарантированно держать данные на российском self-host.
- **Fit:** сколько собственной логики всё равно останется вокруг `TariffQuota`, mechanics registry и транзакций.
- **Удобство владельцу:** одна понятная тарифная форма или второй технический control plane.

### Матрица

Проверка GitHub API на дату среза дала `archived=false` для всех перечисленных публичных репозиториев:
[OpenFGA](https://api.github.com/repos/openfga/openfga),
[Cerbos](https://api.github.com/repos/cerbos/cerbos),
[Flagsmith](https://api.github.com/repos/Flagsmith/flagsmith),
[Unleash](https://api.github.com/repos/Unleash/unleash),
[Lago](https://api.github.com/repos/getlago/lago),
[OpenMeter](https://api.github.com/repos/openmeterio/openmeter),
[Stigg CLI](https://api.github.com/repos/stiggio/stigg-cli) и
[Schematic JS SDK](https://api.github.com/repos/SchematicHQ/schematic-js). Для закрытых backend Stigg и
Schematic статус архива по исходному коду проверить невозможно; это отдельно отмечено в границах исследования.

| Кандидат | Лицензия и живость на 28.07.2026 | Runtime и данные | Fit с нашей моделью | Надёжность и удобство владельцу | Вердикт |
|---|---|---|---|---|---|
| **OpenFGA** | Apache-2.0; CNCF-owned; активный release `v1.18.1` от 29.06.2026. [Что такое OpenFGA](https://openfga.dev/docs/fga), [release](https://github.com/openfga/openfga/releases/tag/v1.18.1), [license](https://github.com/openfga/openfga/blob/main/LICENSE) | Отдельный Go server; может использовать наш PostgreSQL или SQLite. Self-host оставляет данные на нашем сервере. [Datastores](https://openfga.dev/docs/getting-started/setup-openfga/configure-openfga) | Решает «кто может сделать действие над объектом» через relationships; не ведёт period usage, balances и allowance. Заменит часть authorization, но не `TariffQuota`. | Сильный reliability signal — CNCF, production guide, свежие подписанные releases. Для владельца тарифов нет готового business UI: нужны модели/tuples/API. | **Не брать для квот.** Это другой класс задачи. |
| **Cerbos PDP** | Apache-2.0; `v0.54.0` от 20.07.2026; repo активен. [Repo/license](https://github.com/cerbos/cerbos), [release](https://github.com/cerbos/cerbos/releases/tag/v0.54.0) | Отдельный Go binary/container; policies можно держать на disk/git/в PostgreSQL. Self-host в РФ возможен без SaaS Hub. [Quickstart](https://docs.cerbos.dev/cerbos/latest/quickstart.html), [storage](https://docs.cerbos.dev/cerbos/latest/configuration/storage.html) | Policy engine отвечает allow/deny по principal/action/resource. Numeric current usage должен передать caller, журнал и конкурентную запись всё равно строим сами. | Stateless PDP и локальные policies надёжны, но владелец получает YAML/policy workflow; удобный Hub снова внешний control plane. [Как Cerbos принимает решение](https://docs.cerbos.dev/cerbos/latest/policies/evaluation.html) | **Не брать для квот.** Дублирует guard, не заменяет meter. |
| **Flagsmith** | BSD-3-Clause; `v2.256.1` от 27.07.2026. [Repo/license](https://github.com/Flagsmith/flagsmith), [release](https://github.com/Flagsmith/flagsmith/releases/tag/v2.256.1) | Self-host: Node/React dashboard + Python/Django API + PostgreSQL; task processor/caching добавляются при росте. Данные можно оставить в РФ. [Docker architecture](https://docs.flagsmith.com/deployment-self-hosting/hosting-guides/docker), [task processor](https://docs.flagsmith.com/deployment-self-hosting/scaling-and-performance/asynchronous-task-processor) | Хорошо заменяет presence-flags и rollout, но не snapshot/period counter с транзакционным consume. Наш registry всё равно остаётся для unit, period, usage и messaging. | Удобный UI и documented self-host; публичный status page показывал 100% за 90 дней на момент среза. Но это второй UI только для небольшой boolean-части. [Platform architecture](https://docs.flagsmith.com/flagsmith-concepts/platform-architecture), [status](https://status.flagsmith.com/) | **Не брать сейчас.** Цена интеграции выше пяти presence-механик. |
| **Unleash** | AGPL-3.0; `v8.0.3` от 10.07.2026. [Repo/license](https://github.com/Unleash/unleash), [release](https://github.com/Unleash/unleash/releases/tag/v8.0.3) | Self-host Node/container + PostgreSQL; официальный стартовый ориентир 0.5–1 vCPU и 512 MiB–1 GiB RAM только для app container. Данные остаются в нашей инфраструктуре. [Self-host](https://docs.getunleash.io/deploy/getting-started), [requirements](https://docs.getunleash.io/deploy/configuring-unleash) | Feature flags, targeting и rollout; числовое потребление и atomic consume не являются entitlement ledger. Останется параллельная собственная quota-система. | Зрелый UI, SDK caching и активный release — хорошие сигналы. Для одного box это заметный постоянный runtime ради функции, которую уже выполняет registry. | **Не брать сейчас.** Не сокращает собственный quota-code. |
| **Stigg** | Сам engine — коммерческий SaaS/BYOC, не OSS; публичные SDK/CLI имеют Apache-2.0. CLI release `v0.8.1` — 01.06.2026, TypeScript SDK обновлялся 26.07.2026. [TypeScript SDK/API](https://api.github.com/repos/stiggio/stigg-typescript), [CLI release](https://github.com/stiggio/stigg-cli/releases/tag/v0.8.1) | Cloud не держит данные в России: документация указывает primary US и replicas Europe/Asia. BYOC/BYODB/air-gapped продаётся отдельно, но его публичная dependency topology не раскрыта. [PII location](https://docs.stigg.io/docs/where-does-stigg-store-pii), [pricing/BYOC](https://www.stigg.io/pricing) | Самый близкий fit: products, plans, subscriptions, usage и entitlements; можно реплицировать entitlement state в собственный PostgreSQL через BYOS. [Platform overview](https://docs.stigg.io/documentation/getting-started/welcome-to-stigg), [BYOS](https://docs.stigg.io/docs/bring-your-own-solution) | Для владельца cloud UI удобен; pricing заявляет 99.99% SLA на верхних планах и сохранение existing enforcement при rate limit. Но data residency нарушена, а BYOC требует sales/enterprise эксплуатации. | **Не брать.** Лучший UX-кандидат, но не проходит data/control/cost fit. |
| **Schematic** | Engine — коммерческий SaaS; открытый `schematic-js` — лишь MIT SDK/components, release `schematic-components@2.21.0` от 27.07.2026. [SDK repo/license](https://github.com/SchematicHQ/schematic-js), [release](https://github.com/SchematicHQ/schematic-js/releases/tag/schematic-components%402.21.0) | Публичной self-host/BYOC инструкции не найдено. Security docs описывают AWS и обрабатываемые identity/usage/subscription data, но не гарантируют российский регион. [Security](https://docs.schematichq.com/architecture/security) | Очень близкий fit: boolean, event-based и trait-based entitlements, plans, overrides, usage UI. [Concepts](https://docs.schematichq.com/concepts), [usage pricing](https://docs.schematichq.com/use-cases/usage-based-pricing) | Сильное удобство: no-code catalog и embeddable components; pricing заявляет 99.99% uptime, security — SOC 2 Type I/II. Но core закрыт и Russian residency не доказана. [Pricing](https://schematichq.com/pricing), [security](https://docs.schematichq.com/architecture/security) | **Не брать.** Удобен, но внешний источник истины и неизвестное размещение. |
| **Lago** | AGPL-3.0; `v1.51.0` от 27.07.2026; официальный update guide говорит о частых releases. [Repo/license](https://github.com/getlago/lago), [release](https://github.com/getlago/lago/releases/tag/v1.51.0), [update guide](https://getlago.com/docs/guide/lago-self-hosted/update-instance) | Self-host stack: front, API, API worker, clock worker, PostgreSQL, Redis queue, Gotenberg PDF. Можно держать данные в РФ, но это тяжёлый второй billing product. [Docker/components](https://getlago.com/docs/guide/lago-self-hosted/docker) | Отличен для event ingestion, rated usage, invoices и overage. Для наших presence/snapshot/file limits всё равно нужны application guards; для двух period metrics его billing breadth избыточен. | Есть готовый business UI и auditability, но владелец должен обслуживать ещё тарифный каталог, синхронизацию и много контейнеров. | **Не брать сейчас.** Вернуться, если BersonCare начнёт продавать сложный usage billing/overage. |
| **OpenMeter** | Apache-2.0; latest `v1.0.0-beta.231` от 14.07.2026 — активен, но всё ещё beta-tag. [Repo/license](https://github.com/openmeterio/openmeter), [release](https://github.com/openmeterio/openmeter/releases/tag/v1.0.0-beta.231) | Go services/workers + **Kafka + ClickHouse + PostgreSQL**, optional Redis и Svix. Это самый дорогой runtime для одного box. Self-host сохраняет данные в РФ. [Architecture](https://openmeter.io/docs/open-source/architecture) | Лучший OSS-fit: meters, boolean/static/metered entitlements, grants, hard/soft limits, overage и subscription plan edits. [Entitlement](https://openmeter.io/docs/billing/entitlements/entitlement), [grants](https://openmeter.io/docs/billing/entitlements/grant) | Сильная event architecture и свежая разработка, но beta release и Kafka/ClickHouse/worker topology увеличивают площадь отказа и ежедневное обслуживание. Владелец получает второй control plane. | **Не брать на один box.** Первый кандидат на пересмотр при высоком event volume и отдельной инфраструктуре. |

### Одна рекомендация

**Оставить собственную реализацию сейчас.**

Это не рекомендация «писать billing engine с нуля». Наш scope уже уже:

- текущий `TariffQuota` и mechanics registry закрывают presence и snapshot;
- собственный PostgreSQL `usage_event` закрывает всего две period-consumption механики;
- application transaction остаётся единственным местом atomic `check → write → record usage`;
- текущий тарифный редактор остаётся одной панелью владельца;
- не появляются Redis, Kafka, ClickHouse, дополнительный daemon или внешний медицинский-adjacent customer
  identifier store.

Готовые authorization/flag engines не заменяют журнал и atomic consume. Полные entitlement SaaS лучше по UI,
но не проходят российское размещение/контроль. Self-host metering engines функционально сильнее нужного scope,
но стоят дороже собственной небольшой PostgreSQL-модели в runtime и эксплуатации.

**Условие пересмотра:** отдельно оценить OpenMeter и Lago, когда одновременно появятся (а) несколько
тарифицируемых event metrics, (б) overage с реальными счетами, credits/commits или сложные rate cards,
(в) event volume, для которого PostgreSQL journal доказанно недостаточен, и (г) ресурс под отдельные сервисы.
До этого внешний engine не уменьшает общий код: он добавляет sync/failure/integration layer.

Этот вывод определяет §10.7: rollout остаётся внутренним — schema/journal → counters → guards → UI copy →
три первые механики → seat-specific gate; миграции на внешний control plane в этот rollout нет.

## 5. Seats: downgrade ниже текущего usage

### Вопрос

Что происходит при переходе с 6 активных людей на план с 3 местами?

### Что делает практика

Здесь есть устойчивое правило: **система не выбирает трёх людей и не отнимает им доступ автоматически**.

- Microsoft не разрешает уменьшить количество лицензий, пока все они назначены; администратор сначала снимает
  назначения, затем уменьшает quantity
  ([Microsoft 365 licenses](https://learn.microsoft.com/en-us/microsoft-365/commerce/licenses/buy-licenses?view=o365-worldwide)).
- Notion prorate-ит добавленные места сразу, а уменьшение количества оплачиваемых мест учитывает только в
  следующем billing cycle; освободившееся оплаченное место до конца периода можно переназначить
  ([Notion billing](https://www.notion.com/help/billing)).
- Orb описывает seat quantity как fixed-fee quantity: увеличение может быть mid-cycle/prorated, уменьшение
  можно schedule-ить на следующий cycle
  ([Orb subscription edits](https://docs.withorb.com/product-catalog/editing-subscriptions)).

### Что это значит для нас

Safe behavior для `6 used / 3 target`:

1. Пользователь выбирает downgrade.
2. Система показывает: `Сейчас занято 6 из 3 будущих мест. До даты перехода освободите 3 места.`
3. Downgrade сохраняется как pending и вступает в силу на следующем billing anchor.
4. До даты перехода действуют 6 оплаченных мест старого тарифа.
5. На дате перехода:
   - если `used <= 3`, активируется новый limit;
   - если `used > 3`, текущие участники остаются активны, но новые invites/activations блокируются, а статус
     тарифа становится `Требуется освободить места`;
   - никакой пользователь не деактивируется автоматически.
6. Владелец клиники сам удаляет/деактивирует/меняет роль конкретным людям; это auditable business action.

Нужен отдельный ответ владельца только на коммерческую часть: считать ли новый более дешёвый тариф активным,
пока организация остаётся over-seat, или держать старый тариф/цену до устранения конфликта. Без billing engine
безопасный default — **не активировать downgrade, пока seats не приведены к target**, но сохранить pending request.

## 6. Что удалось и не удалось доказать первичными источниками

Доказано:

- event-first + source idempotency — общий паттерн пяти систем;
- billing-cycle anchor — рекомендуемый default, но calendar тоже реальная поддерживаемая модель;
- allowance proration не следует автоматически из price proration;
- downgrade next-cycle и upgrade immediate — наиболее повторяемая политика;
- hard limit зависит от типа ресурса;
- seats и stored data нельзя автоматически удалять/деактивировать;
- готовые движки на текущем one-box scope не дают меньшую полную стоимость владения.

Не удалось закрыть из публичных первичных источников:

1. **Единую формулу allowance proration** для Stripe Billing Meters, Lago и Metronome при произвольной
   immediate mid-cycle смене плана: продукты документируют billing/price/contract operations, но не задают один
   обязательный product-entitlement результат.
2. **Точную runtime dependency topology Stigg BYOC/BYODB**: официальный pricing подтверждает режим, но
   публичного production deployment guide со списком сервисов и ресурсами нет.
3. **Российский data region или self-host для Schematic**: публичные security docs называют AWS и состав
   Customer Data, но не регион и не self-host/BYOC.
4. **Liveness закрытого core Stigg и Schematic по исходному коду**: доступны живые SDK/CLI, docs и pricing,
   но backend engine не является публичным репозиторием.
5. **Универсальное правило, брать ли пониженную цену при unresolved seat overage**: Microsoft/Notion/Orb
   подтверждают отсутствие автоматического удаления и next-cycle semantics, но коммерческая политика цены
   зависит от договора продукта.

## РАЗВИЛКИ ВЛАДЕЛЬЦУ

1. **Якорь period quota.** Рекомендация: billing anniversary организации. Safe default: период
   `[billing_anchor, next_billing_anchor)`, не календарный месяц. Закрывает D8 и §10.4.
2. **Immediate upgrade.** Рекомендация: новый полный limit сразу, накопленный usage сохраняется, без
   пропорционального allowance. Safe default: `remaining = max(new_limit - current_usage, 0)`. Закрывает D9.
3. **Downgrade обычных квот.** Рекомендация: со следующего billing cycle. Safe default: не допускать
   немедленное снижение; если оно всё же сделано вручную, не удалять данные и блокировать только новый рост.
4. **Seat downgrade 6 → 3.** Рекомендация: pending до освобождения мест, без auto-deactivation. Safe default:
   старый тариф/limit продолжает действовать до `used <= target`; затем новый с очередного anchor.
5. **Stored capacity over-limit.** Рекомендация: hard block create/upload, preserve read/export/delete.
   Safe default: предупреждения на 80% и 100%, без grace на рост и без автоматического удаления.
6. **Маркетинговые рассылки.** Рекомендация: hard block после included allowance, пока нет явной цены overage.
   Safe default: критические patient notifications считаются отдельным неограничиваемым bucket.
7. **Платежи сверх лимита.** Рекомендация: проводить и показывать warning, как уже заложено в design. Safe
   default: usage event пишется всегда; limit не блокирует денежную операцию. Закрывает D10.
8. **Тексты §10.5.** Рекомендация: принять таблицу словаря выше целиком. Safe default:
   `Не включено в тариф` / `Без ограничений` / `Включено: N` / `Сверх лимита` /
   `Период оплаты` / `Период лимита`.
9. **Готовый движок.** Рекомендация: не внедрять ни один сейчас. Safe default: собственный PostgreSQL journal
   и текущий mechanics registry; formal re-evaluation OpenMeter/Lago только при выполнении четырёх условий из §4.
