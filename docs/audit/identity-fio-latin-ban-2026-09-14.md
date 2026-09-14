# Адверсарный аудит §20: ФИО специалиста только кириллицей

Дата: 2026-09-14. Ветка: `wt/merge-latin-ban`. Candidate:
`e3e93deb7816698d749a376dcce0ae1835b385ab`.

Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §20 и
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md` Э2. Продуктовый код не исправлялся;
все fault injection сняты. Миграции, DEV/TEST/PROD и автоматические UI-тесты не запускались.

## Вердикт

**FAIL — один достижимый продуктовый обход.** Исправленные POST/PATCH двери работают и имеют зубы,
legacy-латиница не ломает частичную правку. Но `POST /api/account/first-run/bind-specialist`
создаёт новую строку `be_specialists` из латинского `session.user.displayName` без запрета.

| Пункт | Метод | Вердикт |
|---|---|---|
| 1. POST/PATCH: латиница, смешанное, кириллица | route-тест | PASS |
| 2. Обход той же колонки | code-search + `rg` + падающий route-тест | **FAIL** |
| 3. Полнота дверей §20 | code-search + `rg` + чтение всех найденных write-path | **FAIL**: одна незакрытая дверь из п. 2 |
| 4. Старые латинские строки и PATCH без имени | route-тест | PASS |
| 5. Fault injection | route-тесты; UI — взгляд по §10a | **FAIL по критерию брифа**: удаление клиентского гейта тесты не замечают |

## Классификация и blind kill-set

До чтения candidate-тестов пункты 1, 2 и 5 классифицированы как повторяемое поведение; пункты 3 и 4 —
как итоговое состояние. UI-часть пункта 5 проверялась только взглядом: §10a прямо запрещает
автоматические UI/DOM-тесты.

Blind kill-set:

1. POST принимает латинское либо смешанное ФИО и вызывает запись.
2. PATCH принимает латинское либо смешанное ФИО и вызывает запись.
3. PATCH без `fullName` повторно валидирует старое латинское значение и ломает порядок, публикацию либо active-toggle.
4. Другой runtime-путь пишет латинское значение в `public.be_specialists.full_name`.
5. Удаление клиентского гейта формы не замечается acceptance-набором.

## 1. Две исправленные двери — PASS

Независимый route-набор вызывает настоящие handlers, а write-boundary заменяет fake-портом. Он проверяет
обе двери с `Ivan Ivanov`, `Ивaнов Иван` (латинская `a`, U+0061) и кириллическим ФИО; для первых двух
ожидает HTTP 400 и отсутствие write, для третьего — HTTP 200 и ровно один write.

```bash
pnpm --dir apps/webapp exec vitest run src/app/api/admin/booking-engine/specialists/specialistFioLatin.route.test.ts
```

Вывод:

```text
Test Files  1 passed (1)
Tests       9 passed (9)
Duration    327ms
```

POST fault injection: из `PostSchema.fullName` временно снят `.refine(isCyrillicFioInput, ...)`, затем
выполнена та же команда. Вывод:

```text
Test Files  1 failed (1)
Tests       2 failed | 7 passed (9)
создание с латинским ФИО: expected 200 to be 400
смешанное ФИО: expected 200 to be 400
```

PATCH fault injection: из `PatchSchema.fullName` временно снят тот же `.refine`, затем выполнена та же
команда. Вывод:

```text
Test Files  1 failed (1)
Tests       2 failed | 7 passed (9)
правка на смешанное ФИО: expected 200 to be 400
правка на латинское ФИО: expected 200 to be 400
```

Оба production-файла восстановлены после прогонов.

## 2. Обход записи `be_specialists.full_name` — FAIL

Сначала выполнен индексный поиск:

```bash
node /home/dev/brain/tools/code-search.mjs "be_specialists full_name INSERT UPDATE" --repo bcb -k 50
```

Среди runtime-writer он вывел `pgBookingEngine.ts:1081-1170`,
`pgOrganizationProvisioning.ts:201-250` и `specialist-owner-provisioning-rls.sql:321-370`.
После этого точные поиски дали:

```bash
rg -n --glob '!**/*.test.*' '\.insert\(beSpecialists\)|\.update\(beSpecialists\)|beSpecialists\.fullName' apps/webapp/src apps/integrator/src packages
```

```text
apps/webapp/src/infra/repos/pgBookingEngine.ts:1117: .update(beSpecialists)
apps/webapp/src/infra/repos/pgBookingEngine.ts:1141: .insert(beSpecialists)
apps/webapp/src/infra/repos/pgBookingEngine.ts:1162: .update(beSpecialists)
apps/webapp/src/infra/repos/pgBookingEngine.ts:1492: .update(beSpecialists)
apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts:230: .insert(beSpecialists)
```

Остальные совпадения этой команды — SELECT/ORDER BY. `1162` меняет только `isActive`, `1492` — только
настройки напоминаний. Полное множество callers к write-портам:

```bash
rg -n --glob '!**/*.test.*' 'upsertSpecialist\(|ensureOwnBookableSpecialist\(|provisionSpecialistOwner\(' apps/webapp/src apps/integrator/src packages
```

Существенный вывод:

```text
apps/webapp/src/app/api/admin/booking-engine/specialists/route.ts:65: upsertSpecialist
apps/webapp/src/app/api/admin/booking-engine/specialists/[id]/route.ts:58: upsertSpecialist
apps/webapp/src/app/api/account/first-run/bind-specialist/route.ts:28: ensureOwnBookableSpecialist
apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts:212: provisionSpecialistOwner
apps/webapp/src/app/api/auth/specialist-signup/retry/route.ts:29: provisionSpecialistOwner
```

Raw-SQL поиск:

```bash
rg -n --glob '!**/generated/**' --glob '!**/*.test.*' 'INSERT INTO (public\.)?be_specialists|UPDATE (public\.)?be_specialists|full_name\s*=' apps packages deploy
```

```text
deploy/postgres/specialist-owner-provisioning-rls.sql:328: INSERT INTO public.be_specialists (
apps/webapp/db/drizzle-migrations/20260906T030953_add_booking_availability_horizon.sql:286: INSERT INTO public.be_specialists (
apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql:2995: INSERT INTO public.be_specialists (
```

Миграции — разовые исторические действия. Provisioning SQL берёт имя из `specialist_signup_intents`;
его новый input создаёт защищённый `specialist-signup/start`. Отдельный текущий обход — first-run binding:
handler передаёт `ctx.session.user.displayName`, helper проверяет только непустоту, а
`pgOrganizationProvisioning.ensureOwnBookableSpecialist` вставляет значение в `beSpecialists.fullName`.

Конкретная репродукция: clinic owner без `specialistId`, `session.user.displayName = "John Smith"`,
вызов `POST /api/account/first-run/bind-specialist`. Независимый test вызывает настоящий handler,
реальный provisioning-service/helper и fake только на DB-port:

```bash
pnpm --dir apps/webapp exec vitest run src/app/api/account/first-run/bind-specialist/route.route.test.ts
```

Вывод:

```text
Test Files  1 failed (1)
Tests       1 failed | 2 passed (3)
refuses to create a new specialist row from a legacy Latin account name
expected 200 to be 400
```

Неправильный результат: HTTP 200 и вызванный write-port с `fullName: "John Smith"`; новая строка
специалиста получает латинское ФИО. Это нарушает §20: латиница остаётся только в старых записях.

## 3. Все найденные двери ФИО — FAIL из-за first-run binding

Индексный поиск:

```bash
node /home/dev/brain/tools/code-search.mjs "API route request body patient name doctor name specialist name FIO create update" --repo bcb -k 100
```

Он вывел registration, patient profile, doctor client/patient, manual visit, booking и specialist routes.
Точный census route-схем:

```bash
rg -l --glob 'route.ts' 'isCyrillicFioInput|isCyrillicFioInputOrEmpty' apps/webapp/src/app/api | sort
```

```text
apps/webapp/src/app/api/admin/booking-engine/specialists/[id]/route.ts
apps/webapp/src/app/api/admin/booking-engine/specialists/route.ts
apps/webapp/src/app/api/auth/email-otp/register/route.ts
apps/webapp/src/app/api/auth/email-password/register/route.ts
apps/webapp/src/app/api/auth/specialist-signup/start/route.ts
apps/webapp/src/app/api/doctor/booking-engine/appointments/manual-patient-visit/route.ts
apps/webapp/src/app/api/doctor/clients/route.ts
apps/webapp/src/app/api/doctor/patients/[userId]/fio/route.ts
apps/webapp/src/app/api/doctor/patients/[userId]/route.ts
apps/webapp/src/app/api/patient/profile/fio/route.ts
```

Public/patient booking использует ту же защищённую structured-FIO схему:

```bash
rg -n --glob '!**/*.test.*' 'contactFioFieldSchema|inPersonCreateBodySchema' apps/webapp/src/app/api apps/webapp/src/modules/public-booking apps/webapp/src/modules/patient-booking
```

Вывод связал `contactFioFieldSchema` с `inPersonApiSchemas.ts`, `/api/booking/create`,
`/api/booking/public/create` через `bookingPublicBodySchema.ts` и сохранённым `publicBookingIntent`.

Итоговый список вводных дверей:

- специалист/сотрудник: specialist signup start; booking specialist POST/PATCH;
- пациент сам: email-password и email-OTP registration; patient profile FIO; authenticated и public booking;
- врач за пациента: doctor clients POST; manual-patient-visit POST; обе doctor patient PATCH-двери;
- косвенная specialist-дверь без нового request body: first-run bind из session display name — **не закрыта**.

Дополнительный schema census нашёл `auth/phone/start` и `admin/media/[id]`: первый `displayName` относится
только к channel context (confirm его из body не читает), второй — имя медиафайла; это не ФИО. OAuth создаёт
новую строку с email/phone/sub placeholder и не переносит provider profile name в canonical FIO; Telegram/MAX
runtime-путь lookup-only. `BookingEngineSection`/`BookingEngineCatalogLists` не имеют production call-site,
а их запросы всё равно проходят через защищённые specialist routes.

## 4. Старые латинские имена — PASS

В тот же 9-test route-набор добавлена строка специалиста с `fullName: "John Smith"` и три PATCH без
`fullName`: `{sortOrder: 20}`, `{cardIsPublished: true}`, `{isActive: false}`. Все три вернули HTTP 200,
write получил старое имя без изменения. Команда и итог — те же, что в п. 1: `9 passed`.

## 5. Зубы тестов — FAIL по буквальному критерию брифа

POST и PATCH mutations покраснели, как показано в п. 1. Затем из
`BookingSoloSpecialistsSection.tsx` временно удалены все три вызова `latinFioBlocked` — create, edit и
solo-profile — и выполнено:

```bash
pnpm --dir apps/webapp exec vitest run src/app/api/admin/booking-engine/specialists/specialistFioLatin.route.test.ts
```

Вывод:

```text
Test Files  1 passed (1)
Tests       9 passed (9)
Duration    271ms
```

По условию брифа тест пережил снятие проверяемой формы — пункт 5 FAIL. Автоматический UI/DOM-тест не
добавлялся, потому что §10a его запрещает. Это не доказывает отдельный продуктовый отказ: без клиентского
short-circuit запрос доходит до защищённого route, `apiJson` использует server `message`, а `run()` выводит
его в `actionError`; человек всё равно получает причину словами, только после HTTP round-trip.

Авторское сравнение route message с импортированной production-константой удалено как не независимый oracle.
Оставлена поведенческая проверка: сообщение непустое и не равно машинному `invalid_input`.

## Восстановление и границы

```bash
git diff --exit-code -- apps/webapp/src/app/api/admin/booking-engine/specialists/route.ts 'apps/webapp/src/app/api/admin/booking-engine/specialists/[id]/route.ts' apps/webapp/src/app/app/settings/BookingSoloSpecialistsSection.tsx
```

Вывод: пусто, exit 0. Остались только acceptance-тесты и этот audit-artifact. Product fix обхода не
вносился. Full CI не запускался: scope локальный webapp route/test; targeted tests и fault injection дают
нужный сигнал. PROD, TEST и именованная DEV-БД не трогались.
