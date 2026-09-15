# Независимый адверсарный аудит Л6 — телефон заявки и идентичность, 15.09.2026

Вердикт: **FAIL — MUST FIX 2**.

Предмет: два последовательных коммита ветки `wt/leads-reject-ctx`:

- `16085c37c` — добавил поиск владельца подтверждённого телефона заявки, межклинический
  SECURITY DEFINER-корень и capability;
- `a6c9090c9` — снял эту ветку целиком и оставил заявителем учётку подтверждённой почты.

Оракул: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18в: телефон из заявки не
привязывается и не становится событием идентичности; он остаётся видимым врачу полем заявки.
Поля формы и группировка заявок —
`docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` §9.1 и §9.6.

Продуктовая правка ведущего соответствует §18в. Заполненный обязательный телефон не роняет
заявку, `preferred_contact` и телефон доезжают до заявки, `platformUserId` остаётся учёткой
подтверждённой почты, мусор отвечает `400 invalid_phone`. Пять эффективных инъекций дали пять
красных результатов; непойманных поведенческих поломок нет. FAIL вызван двумя обязательными
нарушениями канона репозитория в принятом состоянии: активные документы продолжают предписывать
снятую телефонную ветку, а модульный тест дублирует тот же класс поведения route-теста.

## MUST FIX

### 1. Активные документы всё ещё предписывают запрещённую §18в телефонную ветку

Достижимый сценарий: следующий исполнитель открывает обязательный модульный документ либо текущий
пункт очереди Л6 и восстанавливает поиск владельца телефона, перенос почты и capability, хотя
владелец отменил именно эту механику. Это повторно связывает заявку с чужой учёткой и возвращает
межклинический прокол identity-стены. Нарушено правило `AGENTS.md` «ложная запись о готовности
опаснее незакрытого разрыва» и требование удалять несовместимую старую прозу из активного плана и
канона, а не оставлять рядом.

Команда:

```bash
rg -n 'телефон уже подтверждён у другой|общий механизм platform-user merge|способность объявляется|findTrustedPhoneOwner|снятии объявленной способности' apps/webapp/src/modules/leads/leads.md docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md
```

Результат:

```text
apps/webapp/src/modules/leads/leads.md:7:email-OTP либо из уже аутентифицированного кабинета. Если введённый телефон уже подтверждён у другой
apps/webapp/src/modules/leads/leads.md:8:учётной записи, общий механизм platform-user merge переносит подтверждённую почту на владельца
docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md:517:   зовёт `findTrustedPhoneOwner(phone)`, а этой способности у принципала публичной двери заявки не
docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md:518:   объявлено — значит §1: способность объявляется в `deploy/postgres/privileges/declaration.ts` и в
docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md:522:   тест краснеет при снятии объявленной способности.
```

Исправление должно заменить активную прозу §9/Л6 и `modules/leads/leads.md` на одно действующее
правило §18в. Исторический замер в `E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` и audit/evidence-логи
переписывать нельзя.

### 2. `resolveVerifiedLeadApplicant.unit.test.ts` дублирует route-поведение

Достижимый сценарий: честная перестройка единственного route-пути (перенос или удаление промежуточной
функции без изменения HTTP-результата) требует переписать внутренний unit одновременно с продуктом;
красный цвет перестаёт означать поломку пользователя. Нарушены обязательные §10a «ТЕСТ НЕ
ДУБЛИРУЕТ КОД, КОНТРАКТ ИЛИ ТЕКСТ» и §10b: один сценарий не размножается по unit/route, когда оба
слоя ловят один класс ошибки.

У функции ровно один production-consumer — уже проверяемый route:

```bash
rg -n 'resolveVerifiedLeadApplicant' apps/webapp/src --glob '!*.test.ts' --glob '!*.test.tsx'
```

Результат: определение, import в `api/leads/public/submit/route.ts` и единственный вызов там же.

Собственная инъекция «при заполненном телефоне вернуть другой `platformUserId`» одной поломкой
покрасила оба файла:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts src/app-layer/leads/resolveVerifiedLeadApplicant.unit.test.ts"
```

Результат: `Test Files 2 failed (2)`, `Tests 2 failed | 14 passed (16)`; оба assertion сравнивали
один конечный факт — `platformUserId` почтовой учётки.

Второй unit закрепляет внутренний код ошибки, который не является фактической публичной веткой для
мусора: временная подмена route-map только для `invalid_lead_phone` оставила route-набор зелёным
`14/14`, потому что реальный запрос остановился раньше с `invalid_phone` в валидаторе формы. Публичный
`400 invalid_phone` теперь проверяется route-acceptance; дублирующий модульный файл должен быть удалён.

## Поведение Л6 и слепые инъекции

В route-acceptance добавлены два наблюдаемых сценария:

1. обязательный телефон + `preferred_contact` отвечают `201`, сохраняют оба поля и оставляют
   `platformUserId` учёткой подтверждённой почты;
2. мусор отвечает `400 invalid_phone` и не создаёт заявку.

Оракул не взят из реализации: identity — дословный §18в канона, поля — §9.1/§9.6 плана. UI не
автоматизировался.

| № | Временная поломка production-кода | Команда | Красный результат |
|---:|---|---|---|
| 1 | При наличии телефона resolver возвращает другую учётку | общий route + unit прогон ниже | 2 failed / 14 passed: оба увидели чужой `platformUserId` |
| 2 | Любой заполненный телефон снова бросает ошибку до создания | route-прогон | 1 failed / 13 passed: ожидался `201`, получен `500` |
| 3 | Route передаёт `phone: null` вместо принятого телефона | route-прогон | 1 failed / 13 passed: `phoneNormalized` стал `null` |
| 4 | Route передаёт `preferredContact: null` | route-прогон | 1 failed / 13 passed: `preferredContact` стал `null` |
| 5 | Достижимый `invalid_phone` отображается как `500 lead_submit_failed` | route-прогон | 1 failed / 13 passed: ожидались `[400, invalid_phone]`, получены `[500, lead_submit_failed]` |

Команда для инъекций 2–5:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts"
```

Итого: **5 эффективных инъекций, 5 убито, 0 непойманных**. Пробная подмена недостижимой для этого
payload ветки `invalid_lead_phone` не изменила публичный результат и не включена в число инъекций:
route остался зелёным `14/14`, что подтвердило более ранний отказ валидатора `invalid_phone`.
После каждой инъекции production-файлы возвращены.

Финальный восстановленный baseline:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts src/app-layer/leads/resolveVerifiedLeadApplicant.unit.test.ts"
```

Результат: `Test Files 2 passed (2)`, `Tests 16 passed (16)`.

## Разовые проверки итогового состояния

### Телефонная identity-ветка и права удалены

Точный поиск в исполняемом дереве:

```bash
rg -n 'read_public_lead_trusted_phone_owner|findTrustedCanonicalUserIdByPhoneFromPool|lead_identity_merge_conflict|findTrustedPhoneOwner' apps packages deploy
```

Результат: exit `1`, совпадений нет.

Обратные ссылки в реестрах:

```bash
rg -n 'read_public_lead_trusted_phone_owner|leads\.trusted-phone-owner\.read' deploy/postgres/privileges/declaration.ts deploy/postgres/generated
git ls-files 'apps/webapp/db/drizzle-migrations/*public_lead_trusted_phone_owner*'
```

Обе команды не напечатали ничего. Точное текущее употребление `submittedPhone` на lead-пути найдено
командой:

```bash
rg -n 'submittedPhone|findCanonicalUserIdByPhone|findTrustedCanonicalUserIdByPhone|claimVerifiedEmail' apps/webapp/src/app-layer/leads apps/webapp/src/app/api/leads apps/webapp/src/modules/leads apps/webapp/src/infra/repos/pgLeads.ts
```

Результат: route передаёт `accepted.get('phone')`, resolver только нормализует/валидирует, `pgLeads`
проецирует нормализованное поле; identity lookup и `claimVerifiedEmail` на этом пути отсутствуют.

Смысловой поиск выполнен до точного:

```bash
node /home/dev/brain/tools/code-search.mjs "неподтверждённый телефон заявки выбирает аккаунт identity resolve applicant merge email" --repo bcb -k 30
```

Центральный индекс вернул в том числе старый indexed-снимок resolver и активные противоречащие
документы; поэтому отсутствие в candidate доказано не индексом, а приведёнными точными поисками,
чтением текущего resolver и обратными ссылками декларации/generated/migrations.

### Обязательный телефон, `preferred_contact` и группировка

Route-acceptance выше доказывает `201` и сохранение полей при `isRequired: true`. Группировка —
качество текущего UI-действия и проверена взглядом, без запрещённого UI-теста:
`LeadsTab.tsx:70-84` группирует исключительно по `lead.platformUserId`; route теперь всегда передаёт
сюда identity подтверждённой почты. Снятая телефонная ветка группировку не удаляла.

### Доказанные телефонные пути вне заявки не затронуты

Net-diff от базы перед двумя коммитами:

```bash
git diff --name-status cbbd43fab..a6c9090c9
```

Результат: пять файлов — lead resolver, его unit, lead route, route-test и удаление pool-helper из
`pgCanonicalPlatformUser.ts`. `oauthContactResolve.ts`, телефонный вход, public-booking identity и
delivery-target пути не менялись. Текущее чтение подтвердило:

- `oauthContactResolve.ts:29-47` по-прежнему выбирает владельца доказанного provider-контакта;
- `api/auth/phone/start/route.ts:116-170` нормализует телефон и резолвит учётку до отправки кода;
- `pgPublicBookingUserResolve.ts` принимает обязательный `phoneProven` и вызывает именованный корень;
- `pgIntegratorDeliveryTargets.ts:73-93` и `deliveryTargetsApi.ts:94-147` по-прежнему разрешают
  аудиторию доставки по телефону внутри организации.

Регресс-набор:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app-layer/booking/identifyPublicBookingPayer.unit.test.ts src/modules/auth/oauthVkResolve.unit.test.ts src/modules/auth/oauthWebLoginResolve.unit.test.ts src/modules/integrator/deliveryTargetsApi.d21.test.ts src/modules/auth/phoneStartFallback.route.test.ts src/infra/repos/pgCanonicalPlatformUser.unit.test.ts"
```

Результат: `Test Files 6 passed (6)`, `Tests 43 passed (43)`.

### Generated SQL сходится с `declaration.ts`

Проверено реальной полной генерацией в committed paths, после чего `git diff` не увидел байтовых
изменений:

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
git diff --exit-code -- deploy/postgres/generated
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
git diff --exit-code -- deploy/postgres/generated
```

Первая генерация записала шесть privileges/allowlist-артефактов, вторая — три
`port-context-capabilities.*.sql`; обе `git diff --exit-code` завершились exit `0` без вывода.

Дополнительный гейт:

```bash
/home/dev/brain/host-orch/run-tests.sh "node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs"
```

Результат: `tests 14`, `pass 14`, `fail 0`.

## Остальные проверки

```bash
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec eslint src/app/api/leads/public/submit/route.route.test.ts
```

Обе команды завершились exit `0`, вывод пуст.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.

## НЕ СДЕЛАНО

- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался — запрещён брифом.
- Миграции на DEV не применялись. Owner-aware preflight не запускался: в итоговом candidate нет
  migration-файла Л6 и нет pending SQL этой правки; проверены только генерация и статические гейты.
- Живые DEV/TEST/PROD и настройки TEST не затрагивались; второй Next-сервер не поднимался.
- Автоматические UI-тесты не создавались. Группировка проверена чтением итогового состояния.
- Продуктовый код и два MUST FIX аудитор не исправлял.
- Строка вердикта в `feat` не писалась, merge и push не выполнялись.

## Строка вердикта для ведущего

```text
FAIL Л6, коммиты 16085c37c + a6c9090c9: продуктовая коррекция соответствует §18в — обязательный телефон и preferred_contact дают 201, сохраняются, identity остаётся учёткой подтверждённой почты, мусор даёт 400; 5/5 эффективных инъекций убито, непойманных 0; подтверждённые phone/OAuth/delivery пути 43/43, generated SQL после полной генерации без diff, definer 14/14, tsc и eslint exit 0. MUST FIX 2: активные LEADS_AND_COMMUNICATION_VISIBILITY §Л6 и modules/leads/leads.md всё ещё предписывают снятый merge/capability по телефону; resolveVerifiedLeadApplicant.unit.test.ts дублирует тот же класс route-поведения вопреки §10a/§10b (одна identity-инъекция красит оба файла). Полный CI, DEV apply/preflight, TEST/PROD/live Next не запускались.
```
