# Адверсарный аудит §20, повторный круг: ФИО специалиста только кириллицей

Дата: 2026-09-14. Ветка: `wt/merge-latin-ban`. Candidate: `b00152f201c3222f41b9c7fe98eafdc10f052d12`.
Предыдущий круг: `docs/audit/identity-fio-latin-ban-2026-09-14.md` (FAIL, candidate `c9f2fb8d0`).

Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §20 и
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md` Э2. Продуктовый код не исправлялся: все шесть
fault injection сняты, дерево чистое. Миграции, DEV/TEST/PROD, автоматические UI-тесты не запускались.

## Вердикт

**PASS по скоупу Э2** — дыра первого круга закрыта поведением, а не переписанным ожиданием; обходов в
колонку `be_specialists.full_name` не осталось; старые латинские строки правятся без имени как раньше;
все три инъекции в продуктовый код красят тесты.

**Вне скоупа Э2 — три незакрытые двери §20 (находки, НЕ работа этого аудита).** Все три про роль
пациента и общий предикат, ни одна не относится к карточке специалиста и ни одна не заведена этой веткой.

| Пункт брифа | Метод | Вердикт |
|---|---|---|
| 1. POST/PATCH: латиница, смешанное, кириллица | собственный route-probe + candidate-тесты | PASS |
| 2. Обход той же колонки | `rg` по всем write-path + чтение SQL-функций | PASS |
| 3. Полнота дверей §20 | чтение всех найденных write-path | **3 находки** (Н1–Н3) |
| 4. Старые латинские строки, PATCH без имени | route-тест + инъекция | PASS |
| 5. Зубы тестов | 4 инъекции в продуктовый код | PASS |

## 1. Дверь правда отказывает

Свой probe (`auditProbe.route.test.ts`, временный, удалён после прогона) поднимал настоящие
`POST /api/admin/booking-engine/specialists` и `PATCH .../[id]` со своими моками гейтов:

- POST отказал (400, `upsertSpecialist` не вызван) на `Ivan Ivanov`, `Ивaнов Иван` (латинская `a`
  U+0061), `Ivanov Иван Иванович`, `IVAN`, `И. Smith`;
- PATCH отказал на `Ivan Ivanov` и `Ивaнов Иван`;
- POST принял `Ёлкина Анна-Мария Ильинична` и записал строку дословно;
- `Иванов 123 <b>` отказан (400): `normalizeNameInput` оставляет от `<b>` латинскую `b`.

Команда: `pnpm --dir apps/webapp exec vitest run src/app/api/admin/booking-engine/specialists/auditProbe.route.test.ts`
(12 passed). Probe не коммитился: он дублирует уже существующий
`specialistFioLatin.route.test.ts` — по §10a второй файл с тем же oracle не заводится.

### Падавший acceptance-тест стал зелёным поведением

`git diff c9f2fb8d0 b00152f20 -- .../bind-specialist/route.route.test.ts`: ожидание не ослаблено, а
ужесточено (`toMatchObject({ ok: false })` → `{ ok: false, error: 'fio_latin_rejected' }`), плюс три
новых сценария. Проверка от обратного — подстановка ДОвсего route.ts (`git show c63ce52f1:…`) под
текущий тест-файл:

```
Test Files  1 failed (1)
     Tests  4 failed | 2 passed (6)
```

То есть тесты зелёные из-за изменившегося поведения маршрута, а не из-за переписанных ожиданий.

## 2. Обход: кто ещё пишет `be_specialists.full_name`

Искал по записи в колонку, не по имени поля:

- `rg "beSpecialists" apps --glob '*.ts'` + фильтр по `insert|update|set(` — писателей два:
  `pgBookingEngine.upsertSpecialist` и `pgOrganizationProvisioning.ensureOwnBookableSpecialist`;
- `rg "upsertSpecialist"` — вызывают только `specialists/route.ts` (POST) и `specialists/[id]/route.ts`
  (PATCH), оба под `refine(isCyrillicFioInput)`;
- `rg "ensureOwnBookableSpecialist\("` — единственный HTTP-вызов `account/first-run/bind-specialist`,
  теперь под тем же предикатом (включая ветку fallback на `session.user.displayName`);
- `grep "INSERT INTO public.be_specialists"` по `deploy/`, `apps/`, `scripts/`, `tools/` — вне тестов
  и миграций один SQL-писатель: `app.provision_specialist_owner`
  (`deploy/postgres/specialist-owner-provisioning-rls.sql:328`). Имя берёт из
  `specialist_signup_intents.specialist_full_name`;
- `grep "create_specialist_signup_intent"` — заявку создаёт только `pgOrganizationProvisioning`, вызов
  из `POST /api/auth/specialist-signup/start`, где `lastName`/`firstName`/`patronymic` уже под
  `isCyrillicFioInput`, а `specialistFullName` собирается `formatDoctorFio` из них же;
- интегратор: `rg "be_specialists|specialists" apps/integrator/src` — пусто, интегратор в эту таблицу
  не пишет;
- миграции `20260821T040000` и `20260906T030953` пишут `be_specialists` разово при переносе старых
  данных — это ровно тот случай, который §20 разрешает («латиница остаётся в старых записях»).

Вывод: новых путей в колонку нет, обхода не найдено.

## 3. Полнота §20 — где искал и что осталось открытым

Инвентарь дверей, где человек вводит ФИО (искал через `rg` по `isCyrillicFioInput`, по
`(firstName|lastName|patronymic|fullName|displayName|contactName)\s*:\s*z\b` во всех `app/api` и
`modules`, по `display_name` в `infra/repos` и `deploy/postgres/*.sql`, плюс обход каталога
`app/api/{admin,clinic,doctor,patient,account,auth,booking}`).

**Закрыто (11 дверей):** `auth/email-password/register`, `auth/email-otp/register`,
`auth/specialist-signup/start`, `patient/profile/fio`, `doctor/patients/[userId]`,
`doctor/patients/[userId]/fio`, `doctor/clients`, `doctor/booking-engine/appointments/manual-patient-visit`,
`admin/booking-engine/specialists` POST и PATCH, `account/first-run/bind-specialist`, плюс `contactFio`
публичной записи (`modules/patient-booking/inPersonApiSchemas.ts`).

**Проверено и дверью не является:** приглашение сотрудника (`clinic/invites/*` несёт только e-mail),
`clinic/members` PATCH (только права), `admin/*` (маршрута правки ФИО человека нет), вход из
мессенджеров — `pgIdentityResolution.resolveByChannelBinding` только резолвит существующую привязку и
`displayName` из Telegram/MAX/VK/Яндекса НЕ записывает (это соответствует §20 «автоподстановка
отменяется»), `modules/leads` (порт `create` ни одним маршрутом не вызывается).

### Н1. Латиница в полноширинной форме проходит все двери сразу

`isCyrillicFioInput` считает латиницей только `/[A-Za-z]/`. Полноширинные латинские буквы
(U+FF21–U+FF5A) — латиница по Unicode, но в этот диапазон не попадают.

Ввод `Ｉｖａｎ Ｓｍｉｔｈ` в поле «ФИО» карточки специалиста: `POST 200`, `upsertSpecialist` вызван,
строка записана и выглядит на экране как `Ivan Smith`. Предикат общий, поэтому дыра одинаково открыта
у пациента, сотрудника и соло-специалиста. Канон §20: «Поле просто не принимает латиницу».

Дефект не заведён этой веткой: `isCyrillicFioInput` пришёл из D29 (`a4ff11629`, 04.08).

### Н2. Публичная запись: гейт висит на необязательном `contactFio`, а имя человека берётся из `contactName`

`app/api/booking/public/bookingPublicBodySchema.ts`: `contactName: z.string().min(1)` — без предиката;
`contactFio` — `.optional()`. `validateCreatePatientBookingInput` требует пару «фамилия+имя» только
если `contactFio` вообще прислан. Дальше `identifyPublicBookingPayer` →
`resolveOrCreateUserByPhone(phone, contactName)` → `INSERT platform_users(display_name)`.

Клиент (`ConfirmStepClient.tsx:311`) собирает `contactFio` только когда заполнены И фамилия, И имя;
иначе шлёт один `contactName`. Поля «Фамилия»/«Имя» обязательны в дефолтной форме записи
(`SYSTEM_BOOKING_FORM_FIELDS`), но обязательность настраивается клиникой — сняв её, клиника получает
дверь, где латинская фамилия сохраняется как имя человека. Прямой вызов API открывает её всегда.

### Н3. `POST /api/auth/phone/start` принимает `displayName` без проверки

`bodySchema.displayName: z.string().optional()` уходит в `ChannelContext` и дальше в
`pgUserByPhone.ts:610`: `INSERT INTO platform_users (display_name, role) VALUES (${context.displayName ?? normalized}, 'client')`.
Ни один экран этот параметр сегодня не шлёт (проверено: `AuthFlowV2.tsx:1253`, `:2812`,
`PhoneMessengerAuthFlow.tsx:216` — везде только `phone/channel/chatId/deliveryChannel`), интегратор его
тоже не шлёт. Дверь открыта только для прямого вызова API.

**Все три — находки, а не работа.** Ни одна не входит в Э2 («форма врача и форма человека» для запрета
латиницы в ФИО специалиста) и ни одна не является регрессом этой ветки. Решение о работе — за
владельцем.

## 4. Старые латинские записи

`PATCH .../[id]` с телом без `fullName` берёт каждое неназванное поле из уже сохранённой строки
(`parsed.data.X ?? existing.X`). Свой probe на карточке с `fullName: 'John Smith'`, телом
`{ sortOrder: 99 }`: 200, в `upsertSpecialist` уехали `fullName: 'John Smith'`, старое описание,
`cardIsPublished: true`, `isActive: true`, `sortOrder: 99`. Перетаскивание порядка, публикация и
включение/выключение старую латиницу не трогают и не требуют её править.

Форма кабинета (`BookingSoloSpecialistsSection.tsx`) при переключении активности шлёт только
`{ isActive }` и гейт `latinFioBlocked` не зовёт — старая карточка выключается без правки имени.
Открытая на редактирование карточка шлёт `fullName` целиком, поэтому человеку придётся ввести
кириллицу, чтобы сохранить правку описания легаси-карточки, — это ровно «просить исправить при
следующем входе, не переписывать за человека» из §20, а не обход.

## 5. Зубы тестов — fault injection

Каждая инъекция вносилась в продуктовый код, прогонялась и снималась; дерево после каждой — чистое.

| Инъекция | Результат |
|---|---|
| `route.ts` первого запуска заменён на ДО-фиксовую версию (`c63ce52f1`) | `4 failed / 2 passed` |
| снят `refine(isCyrillicFioInput)` в `bind-specialist` | `3 failed / 3 passed` |
| снят `refine(isCyrillicFioInput)` в `specialists/route.ts` (POST) | `2 failed / 7 passed` |
| снят `refine(isCyrillicFioInput)` в `specialists/[id]/route.ts` (PATCH) | `2 failed / 7 passed` |
| `fullName: parsed.data.fullName ?? ''` вместо `?? existing.fullName` (PATCH) | `3 failed / 6 passed` |
| снят `latinFioBlocked` в форме кабинета | тесты не замечают — **и не должны** |

Последняя строка — не находка. §10a запрещает автоматические UI/DOM-тесты, а запрещающая дверь — сам
маршрут: он покраснел отдельной инъекцией выше. Клиентская проверка отвечает только за то, что человек
видит причину словами вместо `invalid_input`; её снятие латиницу в базу не пускает.

## Что НЕ делалось

- Продуктовый код не правился; три находки Н1–Н3 не чинились (бриф прямо запрещает).
- Живой прогон кабинета на `:5200` не выполнялся: аудитор не поднимает candidate Next (§24.3),
  экран первого запуска принимается живьём после приземления.
- Полный CI не гонялся: изменений в коде этот ход не вносил, повтор зелёного гейта на том же SHA
  запрещён §10.
