# Решения владельца по SaaS Product UX — 2026-07-16

> **Authority scope:** этот dated ruling действует только в части, не изменённой более поздним
> [`OWNER_REVIEW_2026-07-18.md`](./OWNER_REVIEW_2026-07-18.md). Формулировки ниже про `0 pending`, solo scope и
> future clinic относятся к пакету 16.07 и не отменяют решения 18.07 о clinic entitlement/seats, settings, billing,
> libraries и текущих TEST corrections.

**Статус:** уточнения владельца от 2026-07-16 интегрированы и подтверждены полным независимым re-audit
`SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**. Implementation не начиналась; для
solo-first launch осталось `0` pending owner product decisions.

**Приоритет на дату 16.07:** документ побеждает более старые
requirements, operating models, journeys, branding candidates, IA, prototypes и audits. Foundation owner rulings
2026-07-15 сохраняют приоритет в foundation/tenant/enforcement scope; этот документ их не переопределяет.

**Провенанс:** ответ владельца в текущем чате 2026-07-16 на пакет
[`OWNER_DECISION_PACKET.md`](./OWNER_DECISION_PACKET.md). Формулировки ниже передают смысл ответа владельца. Там,
где владелец оставил вопрос открытым или рассуждал о возможном будущем варианте, это не превращено в утверждённый
launch contract.

## Общая граница запуска

Первый выпуск ориентирован на **solo specialist** и не должен задерживаться из-за clinic-only функций. Общая
архитектура может заранее не блокировать будущую организацию с несколькими специалистами, receptionist/assistant и
настраиваемую клиническую коммуникацию, но эти возможности не входят в initial release. Полноценный clinic product
будет отдельным последующим объёмом и может продаваться/настраиваться отдельно.

## UX08-01 — resolved launch

Принят вариант одной organization-scoped карточки. Для специалиста клиники пациент появляется в рабочем списке
только при фактическом или запланированном визите/клинической связи с этим специалистом. По умолчанию история
отфильтрована по его собственным приёмам/событиям; при наличии права он может открыть всю доступную историю
организации или выбрать конкретного другого специалиста. Ограниченные записи по-прежнему определяются отдельной
политикой доступа. Никакого «основного специалиста» из этого решения не следует.

## UX08-02 — rejected premise

Все предложенные lifecycle-модели handoff с primary specialist, care team, accept/reject и передачей между
организациями отвергнуты для текущего продукта. «Передать пациента» сейчас означает создать/запланировать визит у
другого специалиста. Через этот визит пациент становится видимым в рабочем пространстве нового специалиста. Нет
отдельной сущности передачи, подтверждения получателем, ведущего специалиста или автоматического переноса истории.

## UX08-03 — resolved launch

В initial release роли assistant/receptionist и отдельного operations workspace нет. На будущее такую роль можно
заложить архитектурно совместимой и затем продавать/конфигурировать для клиник, но точный набор прав сейчас не
утверждён. Будущая возможность не должна добавлять clinic UI или задерживать solo-first release.

## UX08-04 — resolved launch

Один login. Клиническая работа и управление организацией остаются различимыми поверхностями. На первом этапе
управление предпочтительно открыть как простую отдельную страницу/раздел меню; явный switch режима также допустим,
если он реально нужен композиции. Выбор «switch или пункт меню» — UX implementation choice, а не продуктовый
blocker. Пользователь без specialist binding не получает клиническую поверхность.

## UX08-05 — resolved launch

В общем platform app нейтральный вход открывает последнюю успешно использованную доступную организацию и всегда
показывает заметный switcher; при отсутствии валидного выбора открывается chooser. Trusted link по-прежнему ведёт
только в подтверждённый контекст. Будущее платное organization-branded PWA на собственном origin закреплено за
одной организацией и не показывает org switcher. Platform app и такие PWA могут сосуществовать; manifest/name/icons
могут генерироваться из verified domain/subdomain + org name/logo settings. Separate native organization app вне
текущего scope.

## UX08-06 — resolved launch

Для первой публичной версии выбраны platform landing, опубликованные страницы организаций, booking и join. Общий
каталог/поиск организаций переносится на потом. Это product scope; конкретный rollout всё равно проходит отдельный
release/deploy gate.

## UX08-07 — resolved future capability

Для платного полного брендирования организация использует собственный домен либо субдомен платформы, задаёт своё
название и логотип и полностью заменяет product-facing branding на закреплённой за ней поверхности. Отдельный
layout, theme или bespoke design под каждую клинику не планируется: меняются identity/brand assets, но не базовая
композиция продукта. Вне такой платной org-поверхности staff/admin identity — Therapysto, standard patient identity —
Therapygo. Это решение не требует видимого Therapysto/Therapygo/platform brand внутри fully branded org surface. Какие сведения и
контакты должны быть доступны в legal/support/security flows и как они представлены, определяется позднее по
применимому праву, договорам и security/recovery contract; точная disclosure/copy здесь не выбрана.

## UX08-08 — resolved staged future capability

Сначала выпускается работающий platform web product; clinic/staff product остаётся web app и может быть
устанавливаемым desktop PWA. При покупке branded/business tier организация позже может получить собственный домен
или platform subdomain и автоматически сформированный organization PWA: manifest/name/icons берутся из её
проверенных domain/brand settings. Такой PWA закреплён за одной организацией и не является копией codebase.

Отдельное organization-branded native mobile приложение явно не входит в текущий scope. Store publication,
developer-account ownership, стоимость и сроки остаются research backlog, а не owner gate запуска или текущего
roadmap. Общее направление native/mobile клиента также отдельно от per-organization branding.

## UX08-09 — resolved launch

После настройки organization custom email provider ни одно patient/user email не переходит на platform email
sender; после настройки organization custom SMS provider ни одно patient/user SMS не переходит на platform SMS
sender. Они удерживаются и повторяются только через custom provider соответствующего канала в пределах
`expires_at`; expired никогда не отправляется. Operational sender-health incident не содержит patient content:
зарегистрированный solo specialist/clinic owner получает in-app management alert и platform service email на
account email, затем не чаще одного reminder в сутки и recovery notice. Классификация ошибок, bounded
retry/backoff, TTL по классу сообщения, deduplication и retention — конфигурируемая инженерная policy, а не вопросы
владельцу; defaults зафиксированы в `BRANDING_DOMAIN_CONTRACT.md` §7.1.

## UX08-10 — rejected premise

Patient-level global-admin workflow не нужен ни для launch, ни как target default. Global admin работает с
агрегатами, организациями, platform diagnostics и support reports, но не просматривает карточки пациентов и не
исправляет patient records. Данные, которые допустимо корректировать, должны быть доступны авторизованному пациенту
или специалисту в их интерфейсе. Platform team исправляет system/code defects, а не клинические данные за них.

## UX08-11 — rejected premise

Исходная развилка «что создаётся при приглашении» была неполной. Авторизованный specialist/staff сразу может создать
карточку/relationship пациента и запись: имя, фамилия, телефон, необязательный email и время визита. Также можно
создать walk-in визит и карточку прямо в момент приёма без предварительной booking. Patient self-booking — ещё один
вход, но не обязательный. Portal activation выполняется отдельно: verified email/phone identity связывается с уже
существующей карточкой, назначенной программой и визитами. Доставка сообщения не является доказательством identity
или признаком активированного portal access.

## UX08-12 — resolved launch

В launch переписка solo specialist с пациентом работает так же, как сейчас. Clinic communication topology не
фиксируется и не реализуется сейчас. В будущем она должна быть конфигурируемой: отдельные диалоги со специалистами,
маршрутизация receptionist/assistant или маршрутизация owner — в зависимости от клиники. Архитектура не должна
блокировать эти варианты, но ни один из них не входит в initial scope.

## Текущий decision status

Для solo-first launch осталось **0 product decisions владельца**. Полный paid brand, organization PWA и custom
origin являются согласованными будущими capability, а не условием первого выпуска. Sender retry/TTL/retention —
engineering configuration. Права future assistant/receptionist, clinic communication topology и отдельное
organization-branded native app сохраняются только как non-blocking architecture/research backlog; текущий продукт
их не проектирует и не ждёт нового ответа владельца. Это не означает, что весь будущий clinic/native product уже
спроектирован.
