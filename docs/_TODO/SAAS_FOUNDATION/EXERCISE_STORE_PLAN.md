# Магазин упражнений (Exercise Store) — канонический план

**Статус:** живой продуктовый канон магазина · создан 2026-08-05  
**Карточка taskdb:** не заведена (bounded plan по запросу владельца; `add` — только по отдельной просьбе)  
**Ветка работы (когда начнётся исполнение):** `wt/exercise-store`

> **Этот файл — единственный канон магазина упражнений.**  
> Старые упоминания магазина в тарифах/S4/STORE_* планах — исторические или указатели сюда.
> Тарифы/лестница доступа/оплата тарифа клиники остаются в
> [`TARIFFS_PAYMENTS_ADMIN_PLAN.md`](./TARIFFS_PAYMENTS_ADMIN_PLAN.md) и
> [`SAAS_BILLING_PLAN.md`](./SAAS_BILLING_PLAN.md); этот план **потребляет** их контракты
> (механики, период подписки, лестница доступа, ЮKassa), но не становится вторым каноном PSP/тарифов.
> Store-specific acceptance остаётся здесь; изменение общего billing/tariff контракта синхронно записывается
> в документ-владелец.

**Связанные устаревшие / смешанные источники (не исполнять как план магазина):**

| Файл | Роль после 2026-08-05 |
| --- | --- |
| [`STORE_EXECUTION_PLAN.md`](./STORE_EXECUTION_PLAN.md) | УСТАРЕЛ; P0–P2 = historical entitlements/tariff evidence; **P3 магазин → этот файл** |
| [`STORE_P0_ENTITLEMENTS_PLAN.md`](./STORE_P0_ENTITLEMENTS_PLAN.md) | Historical P0 entitlements; к магазину не относится |
| [`docs/archive/2026-07-plans/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](../../archive/2026-07-plans/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md) §8B S4-3 | Исторический чек-лист 30.07; новая модель ниже, полная матрица соответствия — gate этапов 0/7 |
| [`TARIFFS_PAYMENTS_ADMIN_PLAN.md`](./TARIFFS_PAYMENTS_ADMIN_PLAN.md) | Тарифы **без** магазина; ссылка на S4-3 заменена указателем сюда |
| [`OWNER_DECISIONS_FOR_REVIEW.md`](./OWNER_DECISIONS_FOR_REVIEW.md) §«Магазин» 13.07 | Частично superseded: «только admin-curated» расширено эскизом 05.08 (авторы + модерация) |
| taskdb `#724` | done: трёхуровневая библиотека + «будущий магазин»; сам магазин не строился |

---

## 0. Эскиз владельца

> Ниже — **дословный** текст поручения владельца от 2026-08-05. Не пересказывать и не «улучшать».
> Решения по реализации — в §1–§3; чек-листы — в §4.

```
актуальная задача:
сделать магазин для специалистов, где они смогу покупать наборы упражнений: пакеты упражнений, лфк-комплексов, рекомендаций, программ и тестов.
технически для магазина надо использовать существующий каталог лфк и допольнить его возможностью создания платных наборов. вероятно нужна отдельная таблица для этого, чтобы не вмешиваться лишний раз в существующую схему, но тебе надо это продумать.

1) сделать у глобального админа движок магазина: 
- создавать  базовые наборы платформы (а не сторонних авторов), которые будут входить в тариф без дополнительной оплаты
- назначать стоимость для регулярной подписки или единовременной покупки бессрочного доступа (вероятно это будет по сути тоже подписка но без ограничения срока, но надо продумать как сделать правильнее и как реализуют в мировой практике подобные вещи)
- назначать комиссионный процент платформы, который будет удерживаться с выплат вознаграждений авторам наборов.
- делать первичную модерацию новых наборов, а также видеть и модерировать все предложения от авторов по изменению цены или состава уже утвержденного набора.

- доступность базовых наборов определяется в каждом тарифе тарифной механикой. Не по отдельности конечно, а одним переключателем - либо есть доступ к базовым наборам, либо нет.

2) создать отдельную роль автора набора. 
Автор набора не обязан становиться пользователем платформы (специалистом), и вероятно ему нужна отдельная таблица для их логина и авторизации на платформе. Возможно, этот логин не должен пересекаться с логином специалста - то есть автор набора может быть одновременно специалистом и заходить в свой кабинет специалиста с доступом к клиентам.
- возможно, нужен отдельный кабинет автора, отдельный экран логина с доступом только к странице создания набора. С другой стороны, если автор является так же и специалистом - он явно должен иметь доступ к своему же набору. Причем явно без доплаты. То есть тогда становится бессмысленным двойная работа по созданию набора упражнений и заполнению каталога ЛФК в кабинете специалиста теми же упражнениями.
- возможно если автор является специалистом - ему надо просто дать возможность переносить упражнения из своего каталога ЛФК в набор магазина - то есть не делать двойную работу, а стразу дать ему роль специалиста априори, просто расширить ее до создания набора, если он выбран автором.
- лучше тебе изучить мировые практики как обычно реализуют такие системы в коде - совмещают ли кабинет автора и кабинет специалиста. И хорошо бы переиспользовать как можно больше кода, при этом сохранить уровень безопасности.
- роль автора нельзя получить самостоятельно - только глобальный админ может пригласить автора на платформу.
- кабинет автора нужен для создания, обновления и просмотра статистики и биллинга,  то есть видеть сколько человек купили подписку и историю выплат.
- также автор может предлагать цену на свой набор и обновления набора. 
- Любые изменения набора (цена, состав упражнений) автором только предлагаются и обязательно проходят модерацию глобальным администратором. 

2) у клиник - страница "магазин упражнений"
- список или плитка для просмотра доступных наборов с описанием и фото
- возможность приобрести - для подписки - стоимость добавляется в оплату тарифа (первично делается расчет остатка к оплате - исходя из того, сколько осталось дней до следующей оплаты тарифа)
- при покупке элементы каталога добавляются в каталог клиники.
- на страницах каталога, при наличии хотя бы одного магазинного или базового набора, появляется фильр "наборы" - и там можно выбрать какие видеть элементы (упражнения, комплексы и тд) - личные (те что добавил сам специалист), или любой из доступных, по названию набора

3) при отключении тарифа или отмены подписки на набор - упражнения пропадают и успециалиста/клиники, и у его клиентов.
если подписка на набор не оменена, то после окончания оплаченного периода действуют правила тарифа (то, что натсроено для доступа к системе, например, сколько-то дней предупреждение, потом неделя или две только чтения, потом доступ пропадает) - как настрою.

4) для авторов наборов надо будет создать механику автоматического подсчета использования наборов (активных подписок за период) и формировать выплаты на указанные реквизиты с автоматическим выводом средств на них.
Хорошо бы изучить с точки зрения налогов и механики Юкассы, можно ли автоматически часть денег с поступления (при олате клиниками тарифа+набора упражнений) переводить не на свой счет а сразу автору, то есть себе оставлять плату за тариф и комиссию за продажу и размещение набора в магазине - чтобы не платить налог на доход а сразу быть в роли комиссионера.
если нет, то надо будет назначать какую то дату выплат за период , либо автоматически либо сразу вручную.
```

---

## 1. Что уже построено (замер кода, 2026-08-05)

Замер через code-search + точечное чтение. Индекс на момент разведки: `2026-08-05T01:30:02Z`.

### 1.1. Готово и переиспользуется

| Слой | Факт в коде | Следствие для магазина |
| --- | --- | --- |
| Упражнения и шаблоны ЛФК-комплексов | У `lfk_exercises`, `lfk_complex_templates` и связанных media/join rows есть явный `owner_kind = organization \| platform`; клиника не меняет platform rows | Расширить ownership до `author`; не создавать вторые упражнения магазина |
| Рекомендации и клинические тесты | Канонические таблицы `recommendations` и `tests` уже есть, но сейчас репозитории читают/пишут только текущую `organization_id`; явного `owner_kind` нет | До магазина привести их к той же source-aware ownership-модели |
| Шаблоны программ | Канон — `treatment_program_templates` со stages/groups/items; item types уже полиморфны | В набор кладётся ссылка на шаблон программы, не новый «магазинный вид программы» |
| Проверка полиморфных ссылок | `pgTreatmentProgramItemRefValidation` уже валидирует `item_type + item_ref_id` на сервисном пути | Для `store_pack_items` переиспользовать принцип: FK на полиморфный `item_ref_id` не делать |
| Tariff mechanics | Registry/resolver/constructor существуют; сегодня в нём есть `exercise_catalog` и `exercise_packages` | Owner-решение 05.08 требует убрать выключатель самого каталога и оставить один рубильник base packs |
| Access ladder | `active → grace → read_only → blocked` вычисляется тарифным/биллинговым контуром | Store потребляет итоговое состояние; своей лестницы не заводит |
| SaaS billing | Есть org subscription, invoices только `tariff_period \| seat_overage`, ЮKassa adapter и webhook | Платёжный транспорт переиспользуется, но текущий invoice header не умеет смешанный счёт «тариф + несколько packs» без line items |
| Identity/invites | Есть единый `platform_users` и хешированный invite-token flow для персонала | Автор остаётся тем же user; author invite повторяет механизм, но не создаёт membership клиники |
| Patient snapshots | При назначении элементы программы сохраняют `snapshot` (`treatment_program_instance_stage_items`) | Store-каталоги обязаны читать каноническую карточку; судьбу уже назначенного snapshot нельзя менять молча — см. D2 |
| Grandfather назначений | Текущий platform-LFK playback сохраняется через ссылку из уже назначенной программы даже после выключения старой механики | Owner-решение 05.08 для store требует другого поведения: store-origin assignment получает явный provenance и после revoke закрывается |
| Старые content grants | `content_access_grants_webapp` — user/integrator-centric grant с обязательными integrator IDs | Не расширять его до org-store: store access имеет другой субъект и lifecycle |

### 1.2. Чего ещё нет (разрыв пути человека)

| Человек | Разрыв |
| --- | --- |
| Global admin | Нет сущности «набор магазина», витрины модерации, комиссии, предложений изменений |
| Автор | Нет роли/приглашения/кабинета/кошелька/выплат |
| Clinic admin / specialist | Нет страницы «Магазин упражнений», покупки add-on, фильтра «наборы» |
| Биллинг | Нет line items, store order/subscription и price/commission snapshot; существующий invoice жёстко привязан к tariff subscription |
| Каталоги | Только LFK умеет organization/platform ownership; рекомендации, тесты и шаблоны программ ещё organization-only |
| Доступ | Нет единого source-aware store resolver; list/direct-ID/picker/assignment/media можно было бы разъехать |

### 1.3. Старый контракт, который эскиз расширяет

Решение 13.07 (`OWNER_DECISIONS_FOR_REVIEW.md`): «пакеты только курирует global admin; файлы никогда не копируются».  
Эскиз 05.08 **добавляет авторов, модерацию, цены, комиссии** — admin-only curation больше не полный продукт.
Инвариант **no-copy canonical media** сохраняем (см. §2.2): без него «пропасть при отмене» превращается в опасное удаление копий.

---

## 2. Проектирование механики (предложение к канону)

### 2.1. Сущность набора — отдельная commercial-таблица, контент — ссылки

**Решение:** не раздувать `lfk_exercises` / `lfk_complex_templates` коммерческими полями.
Новый домен `modules/exercise-store`; рабочая целевая модель:

| Таблица (рабочее имя) | Назначение / инвариант |
| --- | --- |
| `store_authors` | Профиль/capability, связанный с одним `platform_user_id`; status; provider/shop reference. Это не второй login |
| `store_author_invites` | Хешированный одноразовый invite от global admin; acceptance создаёт/привязывает `store_authors` |
| `store_packs` | Стабильная карточка набора: title, description, cover, `kind=base \| marketplace`, author, published revision |
| `store_pack_revisions` | Иммутабельная **ревизия состава**: draft/pending/approved/rejected/published. Она фиксирует membership/order, но не копирует payload карточек |
| `store_pack_items` | `(revision_id, item_type, item_ref_id, sort_order)`; ссылки на существующие canonical roots; без FK на `item_ref_id` |
| `store_pack_offers` | Версионированное одобренное предложение: `subscription \| perpetual`, price/currency, status. Предложение автора — draft/pending offer, не отдельная параллельная price-table |
| `store_org_pack_subscriptions` | Коммерческий lifecycle recurring pack: org, pack, approved offer, period, cancel-at-period-end/status |
| `store_orders` / `store_order_lines` | Неизменяемый снимок покупки: pack/revision/offer, price, commission, amount, billing/payment ref |
| `store_org_pack_access` | Выданный paid/perpetual access с source/order/subscription и revoke; не является ledger денег |
| `store_payout_entries` / `store_payouts` | Начисления, refund/chargeback adjustments, период и факт выплаты |
| `system_settings` keys | Глобальный commission percent и payout schedule; отдельную `store_platform_settings` не создавать |

**Ограничения на уровне данных:**

- `base`: `author_id IS NULL`, платных offers нет, создаёт/публикует global admin;
- `marketplace`: `author_id IS NOT NULL`, платный offer появляется только после модерации;
- один published revision на pack; старые revisions не переписываются;
- order line хранит snapshots цены/комиссии/revision, поэтому дальнейшая смена цены не переписывает деньги задним числом;
- горячие lookup-колонки получают индексы в тех же миграциях (§1 «Миграции: индекс на горячую колонку»).

Канонический контент остаётся в существующих таблицах. Pack item = reference, не копия строки и не копия S3 object key.

### 2.2. «Добавляются в каталог» = grant-проекция, не INSERT копий

**Решение владельца 05.08:** листинг каталога =
`own organization rows ∪ items из доступных base/paid packs`; файлы и контентные строки не копируются.

Почему не физическая копия:

1. Эскиз требует исчезновения при отмене/отключении — revoke entitlement; копии пришлось бы вычищать из программ и S3.
2. Уже принятый инвариант 13.07 / S4-3: no-copy.
3. Одна карточка должна обновлять store/catalog surfaces сразу; копия разорвёт это требование.

**Одна каноническая карточка:**

- `exercise` → `lfk_exercises`;
- `lfk_complex` → `lfk_complex_templates` (не legacy `lfk_complexes`);
- `recommendation` → `recommendations`;
- `program` → `treatment_program_templates` (не patient instance и не второй course engine);
- `clinical_test` → `tests`.

`store_pack_items` хранит только тип, id и порядок. Редактирование канонической карточки видно в магазине и
каталогах сразу. Смена состава pack — новая revision и модерация.

Если один item входит в несколько доступных packs, общий каталог показывает его один раз; фильтр каждого
соответствующего pack всё равно его находит.

### 2.3. Подписка vs бессрочный доступ (мировая практика)

| Модель | Как делают | Наш канон |
| --- | --- | --- |
| Recurring subscription | Recurring add-on синхронизирован с основным billing cycle | `access_mode=subscription`; сейчас — proration до конца текущего периода, дальше отдельная line в счёте тарифа |
| «Lifetime» / perpetual | **One-time purchase** + бессрочный grant, не «вечная подписка» | `access_mode=perpetual`; один capture, access без `ends_at`, revoke только refund/chargeback/admin/legal policy |

**Не делать:** «подписка без срока» как recurring с `null` period — ломает dunning, лестницу и отчётность.  
Perpetual ≠ subscription; это отдельный commercial mode на той же сущности pack.

**Billing evolution:** текущий `saas_billing_invoices` — header без line items, жёстко привязанный к тарифу.
Просто добавить три значения в `invoice_kind` недостаточно: один renewal должен содержать одновременно тариф,
места и несколько pack subscriptions.

Целевая форма:

- общий invoice/payment header и `saas_billing_invoice_lines`;
- line kinds минимум `tariff`, `seat_overage`, `store_pack_subscription`, `store_pack_proration`,
  `store_pack_perpetual`;
- существующие invoices backfill-ятся lines без потери provider refs/idempotency/refunds;
- recurring renewal строит один счёт: tariff line + все active pack-subscription lines;
- первая mid-cycle покупка создаёт немедленную proration line, perpetual — one-time line;
- order line хранит `pack_id`, approved revision/offer и snapshots цены/комиссии;
- capture одного webhook идемпотентно активирует ровно соответствующие order lines.

Proration вычисляется только сервером по текущим `currentPeriodStartsAt/currentPeriodEndsAt`, в minor units,
с одной закреплённой rounding-функцией. До checkout UI показывает полную цену, долю остатка, сумму сейчас и
цену следующего периода. Client не присылает сумму как source of truth.

Cancel recurring pack = не продлевать после already-paid-through date. Немедленный revoke возможен только
при refund/chargeback или явном global-admin действии с audit.

### 2.4. Роль автора: один identity, capability, отдельный кабинет

**Мировая практика (Envato / Gumroad-like / Teachable / multi-tenant creator stores):**

- Один аккаунт пользователя; **capabilities/roles** включают creator/seller.
- Отдельный **cabinet/surface** (author dashboard), не второй login-password.
- Buyer и seller совмещаются на одном identity (специалист = покупатель чужих наборов + автор своих).

**Решение для BCB:**

1. **Не** плодить отдельную login-таблицу и не делать второй пароль. Допущенный в первоначальном эскизе вариант
   отдельной авторской auth-системы снят ответом владельца 05.08.
2. Авторская capability = active row в `store_authors`, привязанная к `platform_users`; новый глобальный enum-role/boolean в `platform_users` не нужен.
   Capability появляется **только** после принятия `store_author_invite` от global admin.
3. Отдельный UI-zone `/app/author/**` (или `/app/store-author/**`) с собственным layout/guards — по аналогии patient/doctor isolation.
4. Если тот же user — специалист клиники: кабинет врача остаётся; author-кабинет может выбрать его существующие canonical items для передачи в author ownership по workflow §2.6 — повторно заполнять карточку не нужно.
5. Автор без клиники: после инвайта регистрирует/логинится тем же staff login flow, но без org membership видит только author zone.

**Безопасность:** author routes не видят patient/clinic data; doctor routes не дают write в store без author capability; moderation write — только global admin.

### 2.5. Тарифный рубильник базовых наборов

**Решение владельца 05.08:** каталог (свои упражнения/комплексы/…) — **базовая механика платформы**, в тарифе **выключателя каталога нет**.  
В тарифе один рубильник: **базовые наборы платформы** on/off (если такие наборы есть).
Канонический mechanic key: `platform_base_packs`.

Кодовый хвост: нынешние `exercise_catalog` / `exercise_packages` как tariff visibility «сырой» platform library — **снять с продуктового смысла** (убрать из конструктора / не гейтить ими личный каталог); заменить/свести к рубильнику базовых наборов.

> **Owner ruling 05.08 (#1069, текущий код до store Track — уже так):** «каталоги лфк не надо резать (личные).
> Только доступ к платформенным». Замер 05.08: clinic-owned упражнения/комплексы создаются, меняются, листятся и
> архивируются **без** tariff gate; `exercise_catalog` / `exercise_packages` управляют только
> `includePlatformBase` (видимость/использование platform rows). Registry: `DECLARED_NO_SURFACE` с текстом
> «tariff controls platform-library visibility only» (`protectedActionRegistry.ts`). Не путать с будущей заменой на
> `platform_base_packs` выше — это отдельный этап store-плана, не регресс текущего поведения.

- Base access вычисляется общим resolver динамически: `pack.kind=base AND base_packs mechanic enabled`.
  Не создавать по строке grant на каждый base pack: новый опубликованный base pack должен появиться у всех
  подходящих тарифов без fan-out backfill.
- Marketplace packs рубильником тарифа не открываются — только покупка или личный author-self access.

### 2.6. Публикация контента автором (без двойной работы)

Сначала все пять canonical roots получают явную ownership-модель:

- `owner_kind=organization` → `organization_id NOT NULL`, `store_author_id NULL`;
- `owner_kind=platform` → оба owner-id `NULL`;
- `owner_kind=author` → `store_author_id NOT NULL`, `organization_id NULL`.

Для child/media/join rows ownership наследуется от root. Если RLS требует денормализованный owner, он обязан
совпадать с parent и проверяется тем же write-path; `created_by` не используется как замена owner.

Поток автора-специалиста:

1. Создаёт draft pack revision.
2. «Добавить из моего каталога» выбирает существующую карточку.
3. Для clinic-owned карточки выполняется явная **передача ownership** в author domain с подтверждением; второй
   объект не создаётся. Карточка перестаёт быть собственностью клиники, но остаётся тем же id.
4. На модерацию уходят composition revision и offer (цена/режим).
5. До approve pack не виден чужим клиникам.

**Решение владельца 05.08:** owner = author; авторское право — у автора; файлы хранятся у платформы;
авторские packs не входят в base packs и оплачиваются отдельно.

Смена **состава** опубликованного pack и offer — только proposal → модерация. Правка **самой карточки**
контента меняет одну сущность и сразу видна во всех live catalog/store surfaces.

### 2.7. Один resolver доступа — list/direct/picker/assignment/media

Store обязан иметь один общий проход, например `resolveStoreContentAccess(context, item)`:

1. item принадлежит текущей organization → доступ как к своему каталогу;
2. item входит в published base pack и тариф разрешает base packs → доступ;
3. item входит в pack с active paid subscription/perpetual access → доступ;
4. текущий user — автор item/pack → личный author access без оплаты;
5. иначе отказ.

Resolver учитывает итоговый system lifecycle из тарифов. Его используют:

- каталожные list/count/search и фильтр pack;
- direct item / direct pack URL;
- picker и validation при добавлении в программу;
- assignment/read пациента;
- media/playback/preview.

Скрытая кнопка не является защитой. Параллельный «быстрый» query без resolver запрещён; coverage-gate должен
ронять CI при новом catalog entrypoint в обход общего прохода.

Base access вычисляется динамически. `store_org_pack_access` хранит только paid/perpetual/manual compensation
sources; revoke одного source не закрывает item, если остаётся другой активный source.

При добавлении store item в лечение instance item получает store provenance (`store_pack_id` или эквивалентный
typed source). Старые назначения без store provenance сохраняют существующий grandfather-контракт; новые
store-origin назначения при каждом patient read/playback проходят текущий resolver. Это выполняет решение
05.08, не ломая исторические назначения, которые создавались до магазина.

### 2.8. Модерация

Любое авторское изменение состава = новая `store_pack_revision`; цены/режима = новая `store_pack_offer`.
Обе сущности имеют pending-review state и отдельный admin verdict. Published pack/offer продолжают работать
на предыдущей approved версии, пока admin не approve/reject.

Global admin UI показывает:

- новые packs;
- composition proposals с diff «добавлено/удалено/порядок»;
- offer proposals с old/new price/mode;
- причину reject/changes requested;
- неизменяемый audit trail actor/time/before/after.

Archiving canonical item, который входит в published pack, не должно молча ломать покупку: write-path либо
отказывает до новой approved revision, либо в одной транзакции снимает item новой модерацией. Какой из двух UX
выбран — фиксируется до реализации, но silent broken pack запрещён.

### 2.9. Revoke / лестница (п.3 эскиза) — без хардкода магазина

| Событие | Эффект |
| --- | --- |
| Оплаченный доступ pack закончился/отозван **или** выключен рубильник base packs | entitlement снят → элементы **пропадают** у клиники/специалиста и у клиентов |
| Подписка на pack **не** отменена, но кончился оплаченный период **доступа к системе** | действуют **настройки лестницы тарифа** (предупреждение → только чтение → отключение) — магазин свою лестницу **не** хардкодит |
| Perpetual pack | не истекает по календарю пака; revoke только refund/policy/admin; системная лестница всё равно может ограничить кабинет целиком |

Назначенные программы: snapshot/строка остаётся в БД для истории. Для store-origin assignment его provenance
заставляет **видимость/playback** проверять текущий store access и после revoke отказывать; legacy assignment без
store provenance не меняется этим планом. D2 решает только, обновляется ли содержимое доступного snapshot при
правке canonical card. Магазин не изобретает вторую лестницу рядом с тарифной.

### 2.10. ЮKassa, налоги, выплаты (п.4 эскиза)

**Факт ЮKassa (docs: Split payments / Marketplaces):**

- Есть **сплитование платежей**: один платёж клиента → `transfers[]` на магазины продавцов + комиссия платформы.
- Продавцы (авторы) должны **сами подключить ЮKassa** и быть привязаны к платформе.
- Чеки 54-ФЗ при сплите — от имени магазина, на чей счёт ушли деньги.

**Варианты денежного потока (не налоговое заключение):**

| Схема | Деньги | Что требуется до PROD |
| --- | --- | --- | --- |
| **A. Split** | Доля pack направляется seller, комиссия — платформе | Договорная роль, поддерживаемые ЮKassa категории seller, касса/чеки и возвраты подтверждены ЮKassa + бухгалтером/юристом |
| **B. Settlement** | Всё получает платформа, затем выплачивает автору | Договор с автором, налоговый/кассовый учёт, payout calendar и допустимые реквизиты подтверждены бухгалтером/юристом |

Код сам по себе не делает платформу комиссионером и не определяет налоговую базу. До первого PROD-платежа за
авторский pack обязателен legal/accounting gate с письменным выбором схемы.

**Канон исполнения (ответ владельца 05.08):**

1. **payout-v1:** ledger начислений `gross - commission - refunds/chargebacks`, payout schedule и ручное
   подтверждение global admin. Автовыплата включается только после legal gate; raw bank details не хранить, если
   provider может вернуть token/account reference.
2. **Phase payout-v2:** ЮKassa Split для line items набора в составе платежа `тариф + packs`, если автор onboarded; иначе fallback на ledger.

Смешанный платёж «тариф + набор»: в provider request отдельные transfer lines; tariff amount остаётся платформе.

Начисление recurring pack — за фактически оплаченный период; perpetual — один раз после capture. Выплаченный
refund/chargeback создаёт корректирующую ledger entry, а не переписывает старую.

### 2.11. Границы модулей (Clean Architecture)

```
route / page / server action
  → buildAppDeps
  → modules/exercise-store/service.ts
  → modules/exercise-store/ports.ts
  → infra/repos/pgExerciseStore*.ts
```

- Не сырой SQL в новом коде.
- SaaS billing: расширение `invoice_kind` + port methods; не второй PSP.
- Org entitlements mechanics: один рубильник base packs в `MECHANIC_REGISTRY`.
- LFK list ports: расширить filter `packId | source=own|pack:<id>` без копипасты UI.

---

## 3. Вопросы владельцу — ответы 2026-08-05

«Блокирует этап» = пока не было ответа, этот кусок лучше не кодить вслепую. **Вопросы 1–7 закрыты** ответами ниже.

### Вопрос 1 — как «добавлять набор в каталог клиники»

**Ответ: А.** Видимость тех же исходных элементов набора, без копирования строк в каталог клиники.  
Зачем фильтр «Наборы»: он как раз и нужен, когда у клиники есть подписки на наборы и/или тариф с включёнными базовыми наборами — чтобы отделить личные элементы от элементов конкретного набора.

### Вопрос 2 — логин автора

**Ответ: А.** Один вход на платформу; global admin приглашает автора; отдельный кабинет автора; тот же человек может быть специалистом под тем же логином.

### Вопрос 3 — рубильник в тарифе

**Ответ (по смыслу Б, уточнение владельца):** в тарифе **не должно быть** выключателя «каталог» — каталог упражнений/комплексов/… это **базовая механика платформы**, всегда доступна для своих (clinic-owned) элементов.  
Рубильник в тарифе нужен **только** на подключение **базовых наборов платформы** (если такие наборы существуют): включён → клиника видит базовые наборы; выключен → не видит.  
Следствие для кода: нынешние tariff-keys вроде `exercise_catalog` / «сырая platform library» как отдельный выключатель — убрать/не использовать в продуктовом смысле; остаётся один рубильник базовых наборов.

### Вопрос 4 — «чьи» упражнения автора (уточнение)

Владелец: авторское право — у автора; файлы лежат на нашем файловом сервере; в базовые наборы авторские **не входят** — оплачиваются отдельно.

**Что имелось в виду под «чьи» (технически, не копирайт):** метка владельца строки в БД для доступа и RLS — сейчас есть «клиника» и «платформа». Нужна ли третья метка «автор», чтобы чужая клиника не считала это «платформенным базовым», а видела только после покупки набора.

**Ответ: Б — метка владельца «автор».**  
Авторский набор ≠ базовый набор платформы. Хостинг файлов — наш. Продажа — отдельно от тарифа/base packs.

### Вопрос 5 — что происходит при окончании доступа (исправление ошибочного вопроса)

**Ошибочно** спрашивалось «сразу пропасть или read-only» как будто это хардкод продукта. В эскизе владельца уже сказано:

- отключили тарифный доступ к базовым наборам **или** отменили подписку на набор → элементы **пропадают** у специалиста/клиники и у клиентов;
- если подписка на набор **не** отменена, а кончился оплаченный период **доступа к системе** → действуют **настраиваемые** правила тарифа (предупреждение → только чтение → пропал доступ) — как настроил админ, **без хардкода в коде магазина**.

**Ответ зафиксирован дословно из эскиза.** Магазин не вводит свою лестницу; лестница системы — из тарифной механики.

### Вопрос 6 — выплаты авторам

**Ответ по смыслу:** сначала settlement ledger — деньги принимает платформа и периодически/вручную выплачивает
автору; затем ЮKassa Split. Буквы из первоначальных вариантов больше не используются, чтобы не инвертировать
их с названиями схем в §2.10.

### Вопрос 7 — состав набора в первой версии

**Ответ: сразу все типы** — упражнения, ЛФК-комплексы, рекомендации, программы, тесты.  
**Обязательно:** это **не новые сущности**, а ссылки на те же карточки, что везде. Правка карточки упражнения /
новое поле в тесте меняется сразу в store и live-каталогах. В текущих уже назначенных программах есть клинический
snapshot — точная граница «везде» вынесена в D2, чтобы не отменить её молча.

---

## 3a. Следствия для проектирования (после ответов)

| Тема | Канон |
| --- | --- |
| Каталог клиники | Всегда можно вести **свои** элементы; это не тарифный рубильник |
| Рубильник тарифа | Только «базовые наборы платформы» on/off |
| Покупной/базовый набор в UI | Те же `lfk_*` / программы / тесты / рекомендации по id; фильтр «Наборы» |
| Авторский контент | `owner_kind=author` (или эквивалент); не смешивать с base packs |
| Файлы | На нашем storage; право использования — у автора / по лицензии набора |
| Revoke набора | Пропажа видимости; лестница системы — только когда pack-подписка жива, а системный доступ режет тариф |
| Правки контента | Одна каноническая карточка → везде; смена **состава** набора автором — через модерацию ревизии |

## 3b. Три уточнения, найденные при проверке реального кода

Это не повтор старых вопросов; без этих ответов base packs можно строить, но соответствующий поздний кусок
нельзя завершить честно.

### D1 — кому бесплатен собственный pack автора-специалиста

Владелец решил: автор-специалист пользуется своим pack без оплаты. Нужно определить границу:

- только сам автор в любом своём doctor workspace;
- или вся одна выбранная им клиника;
- или все клиники, где он состоит.

Без решения нельзя создавать `author_comp` как org-wide grant: это могло бы бесплатно открыть pack другим врачам.
Нужно решить до author-comp access в этапе 3.

### D2 — меняется ли уже назначенная пациенту программа при правке карточки

Store и каталоги будут читать одну canonical карточку — там правка видна сразу. Но текущая система при назначении
программы сохраняет snapshot элемента для клинической истории.

- оставить snapshot: магазин/каталоги обновятся сразу, уже назначенная пациенту версия останется прежней;
- обновлять и старые назначения: это отдельная переделка treatment-program snapshots и клинической истории.

Нужно решить до patient acceptance в этапе 5. Сам магазин не удаляет snapshot-механику молча.

### D3 — кому применяется новая одобренная цена

- только новым покупателям (старым оставить прежнюю цену);
- всем активным подпискам со следующего периода после уведомления;
- каждому подписчику после отдельного согласия.

Нужно решить до recurring billing в этапе 4. Invoice/order всегда хранит фактический price snapshot.

---

## 4. Этапы и чек-листы

Правила галочек: `[ ]` / `[x]`+evidence / `[-]` только владелец. Галочка тем же коммитом, что код.
Один этап = один логический batch; следующий не начинается до gate предыдущего (§10/§24).

### Этап 0 — Reality lock и границы

**Цель:** не строить store поверх неверной карты существующих каталогов/биллинга.

- [x] Вопрос 1 — А (видимость без копирования; фильтр «Наборы») — 2026-08-05.
- [x] Вопрос 2 — А (один логин + кабинет автора) — 2026-08-05.
- [x] Вопрос 3 — рубильник только «базовые наборы»; каталог не выключается тарифом — 2026-08-05.
- [x] Вопрос 4 — author ownership, не platform-base — §3 «Вопрос 4», 2026-08-05.
- [x] Вопрос 5 — store не хардкодит тарифную лестницу — §3 «Вопрос 5», 2026-08-05.
- [x] Вопрос 6 — settlement ledger, затем Split — §3 «Вопрос 6», 2026-08-05.
- [x] Вопрос 7 — сразу пять существующих типов — §3 «Вопрос 7», 2026-08-05.
- [x] `TARIFFS_PAYMENTS_ADMIN_PLAN.md` и `STORE_EXECUTION_PLAN.md` форвардят сюда — evidence: шапки/раздел P3 этих файлов.
- [x] `CURRENT_AUTHORITY_MAP.md`, `docs/README.md` и `docs/INITIATIVES.md` называют этот файл каноном магазина —
      evidence: строки «Магазин упражнений» / `Exercise store` в этих индексах, 2026-08-05.
- [ ] По каждому из пяти canonical roots зафиксированы: root table, child/media tables, list/direct/write ports,
      picker/assignment/player callsites и текущая ownership-модель.
- [ ] По SaaS billing зафиксирован seam миграции header→lines, renewal builder, checkout, webhook, refund,
      idempotency; второй provider/webhook/ledger рядом не проектируется.
- [ ] D1 имеет ответ до author complimentary access этапа 3.
- [ ] D2 имеет ответ до patient snapshot acceptance этапа 5.
- [ ] D3 имеет ответ до recurring billing этапа 4.
- [ ] Старые S4-3 пункты сопоставлены строка-в-строку с этапами ниже; потерянных owner requirements нет.

**Gate:** inspection report в этом разделе/ссылкой; кода/миграций ещё нет.

---

### Этап 1 — Единая ownership-модель пяти существующих каталогов

**Цель:** `organization | platform | author` описывает те же упражнения, комплексы, рекомендации, программы и
тесты; магазинных дублей нет.

- [ ] `store_authors` создаётся как dormant identity/ownership root, связанный с `platform_users`; login flow не меняется.
- [ ] Drizzle-миграции расширяют `lfk_exercises`/`lfk_complex_templates` до author ownership и добавляют явный
      ownership в `recommendations`, `tests`, `treatment_program_templates`; необходимые child/media rows наследуют root.
- [ ] CHECK-инварианты §2.6 и индексы `(owner_kind, organization_id/store_author_id, archived/status)` в той же миграции.
- [ ] Existing organization rows остаются organization-owned; никакой NULL row автоматически не объявляется platform/author.
- [ ] List/get/create/update/archive ports пяти каталогов работают source-aware; clinic write по-прежнему только
      organization-owned, author write — только own author rows, platform write — только global admin.
- [ ] `item_ref_id` остаётся полиморфным без FK; единый validation port знает все пять типов.
- [ ] Media access следует owner root; прямой `/api/media/*` не превращает author/platform file в публичный.
- [ ] Existing treatment-program instance snapshots не переписываются этим этапом.

**Поведенческий gate:** named faults «org B видит/меняет item A», «author X меняет item Y», «NULL row стал
platform автоматически» пойманы самым дешёвым публичным слоем; webapp typecheck/lint. RLS final proof — TEST
roles в этапе 7, новый DB-test harness без owner-go не строить.

**Выход:** один source-aware catalog foundation для всех store item types.

---

### Этап 2 — Pack core, base packs и global-admin engine (без денег)

**Цель:** global admin собирает бесплатные base packs из canonical items; тариф открывает их одним рубильником.

- [ ] Drizzle schema: `store_packs`, `store_pack_revisions`, `store_pack_items` из §2.1; statuses/CHECK/unique/hot indexes.
- [ ] `modules/exercise-store/{types,ports,service}.ts`, infra repo, DI; route/page только parse/auth/call.
- [ ] Pack item validator принимает ровно пять root types и проверяет owner/status; DB FK на `item_ref_id` нет.
- [ ] Base pack: author/offer запрещены конструкцией; CRUD/publish/archive — global admin only + immutable audit.
- [ ] Admin UI: список, карточка, cover, composition editor, preview, publish/archive; existing platform catalog
      pickers переиспользуются.
- [ ] Tariff registry: один boolean `platform_base_packs` («Базовые наборы платформы»); личные каталоги — always available.
- [ ] Старые `exercise_catalog`/`exercise_packages` удалены из constructor/resolver/callsites и persisted tariff
      data согласованной migration; raw platform item не виден клинике, пока не входит в доступный base pack.
- [ ] Base access вычисляется resolver динамически, без per-org×pack fan-out rows.
- [ ] Новый published base pack автоматически виден всем org с включённым рубильником; отдельной настройки
      конкретного base pack в тарифе нет.
- [ ] Нет store price/commission/payment UI для base pack.

**Поведенческий gate:** tariff ON/OFF меняет list/direct/picker/media; личный каталог остаётся доступен в обоих
состояниях; publish/grant не создаёт копий canonical rows/object keys; scoped UI + webapp typecheck/lint.

**Выход:** base packs полностью работают без author commerce.

---

### Этап 3 — Author invite, кабинет и модерация

**Цель:** приглашённый автор создаёт marketplace pack и предлагает composition/offer; global admin принимает.

- [ ] `store_author_invites`: global-admin only issue/revoke/resend/accept, hash+expiry+single-use; self-enrolment отсутствует.
- [ ] Acceptance связывает один `platform_user` с `store_authors`; existing doctor identity не дублируется.
- [ ] `/app/author/**` имеет отдельный guard/layout/nav; author без org не попадает в clinic/patient surfaces.
- [ ] Author draft editor использует canonical item editors/pickers; повторной store-карточки контента нет.
- [ ] Передача clinic-owned item в author ownership — атомарна и не меняет id; UX не допускает молчаливой потери
      доступа исходной клиники или уже назначенных программ. До transfer сервис проверяет active refs; конкретный
      complimentary scope и судьба origin clinic — по D1.
- [ ] Author-self resolver даёт автору доступ без оплаты, но не превращает это молча в бесплатный org-wide grant.
- [ ] `store_pack_offers`: subscription/perpetual, price/currency; global commission — из `system_settings`;
      base pack offers конструктивно невозможны.
- [ ] Global admin назначает единый commission percent через allowlisted `system_settings` key + Settings UI;
      диапазон/decimal semantics валидируются одним accessor, per-author override нет.
- [ ] Composition и offer отправляются/модерируются отдельно; previous published revision/offer живы до approve.
- [ ] Admin moderation UI показывает diff, verdict/reason и audit trail.
- [ ] Author не видит покупателей поимённо и не видит чужие packs/финансы.
- [ ] Author cabinet не рисует фейковую статистику: до этапа 6 — честный empty state или вкладка скрыта.

**Поведенческий gate:** неприглашённый user не получает capability; author не публикует/меняет live
composition/price в обход moderation; admin approve атомарно переключает только нужную revision/offer.

**Выход:** authored pack готов к продаже, денег ещё нет.

---

### Этап 4 — Billing line items, витрина и покупка

**Цель:** clinic owner/admin покупает subscription или perpetual; recurring pack входит в общий счёт тарифа.

- [ ] D3 закрыт: новая approved цена имеет явное правило для existing subscriptions.
- [ ] Billing schema эволюционирует к invoice lines (§2.3); existing tariff/seat invoices backfill без потери refs,
      refunds, idempotency и period uniqueness.
- [ ] Store schema: subscriptions, orders/lines, paid/perpetual access; каждый order line содержит snapshots
      revision/offer/price/currency/commission.
- [ ] Витрина клиники: published marketplace packs, фото/описание/author, approved prices; base packs помечены
      «Входит в тариф», купить их нельзя.
- [ ] Purchase/cancel доступны только clinic owner/payment-admin; specialist может browse, но не покупать.
- [ ] Org/pack/offer/amount/period выводятся сервером; client input не является source of truth.
- [ ] Mid-cycle subscription: один proration calculator + понятный preview; следующий renewal содержит tariff line
      и все active pack lines.
- [ ] Perpetual: one-time order/access, не infinite recurring row.
- [ ] Existing SaaS PSP config/adapter/webhook переиспользованы; второго provider registry/webhook нет.
- [ ] Capture/replay/refund/chargeback идемпотентно меняют только связанные lines/access; active alternate source сохраняет доступ.
- [ ] Cancel recurring pack прекращает renewal и закрывает access после paid-through date; refund/admin revoke — сразу.
- [ ] Если системный paid period закончился, применяется только тарифная лестница; pack не создаёт свою.

**Поведенческий gate:** wrong org/price/currency/offer, duplicate checkout/webhook, partial capture/refund и
renewal без pack line названы до тестов и убиты targeted tests; живой TEST checkout — только тестовый YooKassa
магазин по `SAAS_BILLING_PLAN.md`.

**Выход:** деньги и access сходятся на одном order/invoice lineage.

---

### Этап 5 — Каталоги, фильтр «Наборы» и полный revoke path

**Цель:** купленные/base items видны как те же entities; direct URL/patient/media не обходят access.

- [ ] D2 закрыт; store не меняет treatment-program snapshot semantics молча.
- [ ] Один resolver §2.7 используется list/count/search/direct/picker/assignment/patient/media для пяти типов.
- [ ] Фильтр появляется только при ≥1 доступном base/paid pack; значения: «Личные» + каждый доступный pack;
      один item не дублируется в «Все», но находится каждым своим pack-filter.
- [ ] Фильтр добавлен на каталоги упражнений, LFK-комплексов, рекомендаций, шаблонов программ и тестов с
      совместимым URL contract.
- [ ] Изменение canonical карточки сразу видно в store + live catalogs; composition revision остаётся только списком refs.
- [ ] Picker/assignment сохраняет typed store provenance на instance item; один и тот же item при нескольких
      sources выбирает/сохраняет доступный source без неявного grandfather.
- [ ] Отмена/expiry/revoke скрывает items у клиники и клиентов; direct ID, picker и media/playback также отказывают.
- [ ] `authorizeMediaDelivery`/platform-LFK bridge различают legacy assignment и store-origin assignment:
      legacy grandfather не переписывается, store-origin после revoke не открывает snapshot/media.
- [ ] Base tariff OFF скрывает только base-pack content, но не own catalog и не separately paid packs.
- [ ] Coverage gate ловит новый catalog entrypoint в обход resolver и имеет self-test.

**Поведенческий gate:** A/B list/direct/picker/assignment/media negatives; no-copy row/object-key invariant;
изменение canonical field видно во всех live store/catalog surfaces. Не писать тесты текста SQL/source.

**Выход:** полный путь использования и отзыва доступа закрыт.

---

### Этап 6 — Начисления, кабинет автора и выплаты v1 → Split v2

**Цель:** автор видит активные подписки и историю денег; платформа не платит дважды.

- [ ] Начисление использует одобренный commission snapshot из order line; live-настройка не переписывает старые продажи.
- [ ] Accrual строится из captured order lines: recurring — за оплаченный период, perpetual — один раз;
      commission/refund/chargeback записываются immutable entries.
- [ ] Period close идемпотентен; повтор job/manual action не создаёт второе начисление/выплату.
- [ ] Author dashboard: количество active subscriptions, gross, commission, adjustments, payable, payout history;
      только агрегаты без PII клиник.
- [ ] Payout v1: schedule + global-admin approval/run; минимум реквизитов, restricted access/audit; автоматическая
      отправка выключена до legal/accounting gate.
- [ ] До первого PROD authored payment бухгалтер/юрист письменно подтверждают settlement-схему, договоры,
      кассу/чеки, налоги, refund handling.
- [ ] Payout v2 отдельным подэтапом: YooKassa Split onboarding, transfer lines, seller receipts/refunds; fallback
      в ledger только если это разрешено legal gate.

**Поведенческий gate:** commission snapshot не меняется задним числом; double accrual/payout невозможен;
refund после period close создаёт adjustment; author A не видит ledger B.

**Выход:** payout-v1 готов юридически и технически; Split подключается без смены store access model.

---

### Этап 7 — Integration / launch gate

- [ ] Full CI (`pnpm run ci`) один раз перед merge/integration checkpoint магазина.
- [ ] RLS/A-B matrix ownership/packs/orders/access/authors/payouts на точных TEST roles; не A0 baseline.
- [ ] Secret scan: нет ключей ЮKassa в docs/commits.
- [ ] Five-type no-copy census: canonical root ids и media object keys до/после grant/purchase совпадают.
- [ ] Старый S4-3 закрыт prose pointer/owner cancel/evidence; ни один store requirement не живёт вторым каноном.
- [ ] Owner walkthrough: base pack→tariff ON/OFF; author invite→moderation; subscription proration→renewal;
      perpetual→refund; catalog filter→patient revoke; author stats→payout.
- [ ] Legal gate подтверждён перед authored PROD payments; без него base packs можно запустить, authored commerce — нет.

---

## 5. Первичная декомпозиция (порядок)

```
Этап 0: reality lock + D1–D3
  → Этап 1: ownership пяти canonical каталогов
    → Этап 2: pack core + base packs + один tariff switch
      → Этап 3: author identity + moderation + approved offers
        → Этап 4: invoice lines + storefront + subscription/perpetual
          → Этап 5: filters + direct/picker/patient/media revoke
            → Этап 6: accruals + payouts v1 → Split v2
              → Этап 7: TEST/full CI/owner/legal launch gate
```

Base packs можно выпустить после этапов 0–2 и их integration gate, не ожидая authored commerce. Этапы 3–6
не должны делать base packs зависимыми от автора, PSP или payout.

Зависимости от соседних планов:

- Лестница доступа и tariff period — уже в тарифах/биллинге; магазин **не** изобретает вторую лестницу.
- Billing implementation/gates синхронно отражаются в `SAAS_BILLING_PLAN.md`; здесь остаётся store product
  acceptance, а не второй канон PSP.
- Tariff key removal/addition синхронно отражается в `TARIFFS_PAYMENTS_ADMIN_PLAN.md`; личный каталог не
  превращается в платную механику.
- Platform LFK ownership (`0217`) — стартовый прецедент, но не готовая модель остальных четырёх roots.
- Existing treatment-program snapshots меняются только после D2 и в соответствии с
  `TREATMENT_PROGRAM_EXECUTION_RULES.md`.

---

## 6. Явно не входит (чтобы не расползтись)

- Магазин ИИ-разбора анализов / созвонов / курсов как отдельные товары (braindump 17.06) — другие workstream.
- Patient-facing store (продажа пациенту) — не этот план.
- Замена всего SaaS billing / смена PSP.
- Отдельные store-копии упражнений/комплексов/рекомендаций/программ/тестов.
- Автоматическая публикация clinic catalog → author/platform без явной передачи ownership и модерации pack.
- Физическое копирование media object keys между tenant и store.
- Переписывание клинических snapshots уже назначенных программ до ответа D2.
- Reviews/ratings, coupons/promocodes, affiliate program, multi-currency и variable commission — отдельные
  owner-решения, в v1 не добавлять.

---

## 7. Журнал решений по этому плану

| Дата | Решение | Где зафиксировано |
| --- | --- | --- |
| 2026-07-13 | Admin-curated packages; no file copy; grant model | `OWNER_DECISIONS_FOR_REVIEW.md` (частично superseded authorship) |
| 2026-07-17 / 30.07 | Магазин отложен из #751 / S4-3 | `TARIFFS_PAYMENTS_ADMIN_PLAN.md`, S4 triage |
| 2026-08-05 | Новый канон магазина + эскиз владельца (авторы, витрина, выплаты) | **этот файл** |
| 2026-08-05 | Ответы владельца: видимость без копий; один логин; рубильник только base packs; owner=author; лестница не хардкодится; payout settlement→Split; все типы = те же сущности | §3 |
| 2026-08-05 | Повторная сверка с кодом: ownership пяти roots, invoice lines, store provenance против legacy grandfather, один resolver; выявлены D1–D3 | §1–§5 |
