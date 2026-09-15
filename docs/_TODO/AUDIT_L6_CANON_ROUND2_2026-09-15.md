Классификация по §24.4: смешанный аудит — снятые активные тексты и удаление дубль-файла проверены взглядом; сохранность двух повторяемых route-поведений проверена двумя раздельными fault injection.

# Независимый аудит Л6, круг 2 — снятые тексты и снятый дубль-тест

Вердикт: **FAIL — MUST FIX 1**.

Кандидат: `5db5a86ea` ветки `wt/leads-reject-ctx` поверх принятой продуктовой
коррекции `a6c9090c9`. Продуктовое поведение в этом круге не менялось.

Оракул:

- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18в: телефон заявки не становится
  идентичностью, а остаётся видимым врачу полем;
- `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, пункт 6 очереди:
  заполненный телефон не должен ронять заявку, мусорный телефон даёт `400 invalid_phone`;
- прямой критерий брифа круга 2: route-тест обязан покраснеть на каждой из двух
  инъекций, ради которых существовал удалённый unit-файл; непойманная инъекция — MUST FIX.

## MUST FIX

### 1. Route-тест не ловит снятие форматной проверки из resolver-а

Заданная брифом проверяемая поломка: из
`apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.ts` удалены
`normalizePhone`, `isValidPhoneE164` и условие, бросающее `invalid_lead_phone`.
Несмотря на это, весь route-файл остался зелёным: `14 passed (14)`. Сценарий
`мусор в телефоне отвечает 400 invalid_phone` остановился раньше в настоящем
`bookingForm.validateAnswers` и поэтому не доказывает сохранность форматной проверки
resolver-а, ради которой существовал второй тест удалённого unit-файла.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts"
```

Результат при второй инъекции:

```text
Test Files  1 passed (1)
Tests       14 passed (14)
RELEASED test lock (rc=0, 67s)
```

Это не утверждение, что исходный HTTP-путь кандидата сейчас возвращает неверный
результат: на восстановленном коде он зелёный. Это провал обязательного acceptance-гейта
снятия теста: кандидат назвал оба unit-сценария дублями route-защиты, но fault injection
доказал достаточность route-защиты только для одного из двух.

Исправление продуктового кода или тестов аудитор не делает. Итоговый вариант обязан
одновременно пройти прямой критерий брифа и фильтр §10a/§10b: не возвращать бессмысленный
дубль внутренней формы вместо наблюдаемого поведения.

## Активные тексты — PASS

Тот же точный поиск, что в круге 1:

```bash
rg -n 'телефон уже подтверждён у другой|общий механизм platform-user merge|способность объявляется|findTrustedPhoneOwner|снятии объявленной способности' apps/webapp/src/modules/leads/leads.md docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md
```

Результат — одно совпадение:

```text
docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md:517:   звала `findTrustedPhoneOwner(phone)`, а этой способности у принципала публичной двери заявки не
```

Это описание причины уже случившегося дефекта в прошедшем времени, не указание вернуть
механику. Непосредственное чтение абзацев подтвердило действующее правило в обоих файлах:
телефон валидируется и сохраняется полем заявки, identity остаётся учёткой подтверждённой
почты, merge и новая способность не создаются. Прежняя редакция прямо названа отменённой
решением владельца 15.09.

Расширенный контроль тем же шаблоном по всем неархивным Markdown-файлам:

```bash
rg -n 'телефон уже подтверждён у другой|общий механизм platform-user merge|способность объявляется|findTrustedPhoneOwner|снятии объявленной способности' --glob '*.md' --glob '!**/archive/**' .
```

Он дополнительно нашёл только историческую строку живой приёмки в
`NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` и доказательства/команды аудита круга 1 в
`AUDIT_L6_CANON_2026-09-15.md`. Указания реализовать снятый перенос почты или объявить
capability в активном каноне и плане не осталось.

Удаление файла подтверждено командой:

```bash
test ! -e apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.unit.test.ts
```

Результат: exit `0`.

## Таблица инъекций

Перед инъекциями baseline route-файла той же командой: `1 passed`, `14 passed`,
`rc=0`. Каждая инъекция выполнялась отдельно; после обеих production-файл возвращён
до байтового состояния кандидата, что подтверждено командой:

```bash
git diff --exit-code -- apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.ts
```

Результат: exit `0`, вывод пуст.

| № | Временная поломка в `resolveVerifiedLeadApplicant.ts` | Наблюдаемый результат route-теста | Итог |
|---:|---|---|---|
| 1 | При заполненном телефоне вернуть `phone-owner-account` вместо учётки подтверждённой почты | `1 failed / 13 passed`; assertion сценария обязательного телефона увидел чужой `platformUserId` | Поймана |
| 2 | Удалить normalize/E.164-проверку и ветку `invalid_lead_phone` | `14 passed / 14`; красного assertion нет | **Не поймана — MUST FIX** |

Итого по команде инъекций: **2 внесены, 1 поймана, 1 не поймана**.

## Финальные проверки восстановленного кандидата

Затронутый набор заявок:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts src/modules/leads/service.unit.test.ts src/modules/leads/notifyClinicLeadCreated.unit.test.ts src/infra/repos/pgLeads.rejection.unit.test.ts src/app-layer/leads/withDoctorLeadsApiAccess.unit.test.ts"
```

Результат: `Test Files 5 passed (5)`, `Tests 23 passed (23)`, wrapper `rc=0`.

TypeScript:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec tsc --noEmit"
```

Результат: wrapper `rc=0`, вывод пуст.

ESLint по существующим затронутым TS-файлам:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app-layer/leads/resolveVerifiedLeadApplicant.ts src/app/api/leads/public/submit/route.route.test.ts"
```

Результат: wrapper `rc=0`, вывод пуст.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.

## НЕ СДЕЛАНО

- Продуктовый код и тесты не исправлялись; обе fault injection полностью откатаны.
- Полный CI не запускался — запрещён брифом, исполняемый код в `feat` ещё не принят.
- DEV/TEST/PROD, миграции, режим TEST и работающий `127.0.0.1:5200` не затрагивались;
  второй Next-сервер не поднимался.
- Автоматические UI-тесты не создавались.
- Строка вердикта в `feat` не писалась; merge и push не выполнялись.

## Строка вердикта для ведущего

```text
FAIL Л6, круг 2, кандидат 5db5a86ea поверх a6c9090c9: активные leads.md и пункт Л6 плана больше не предписывают снятый перенос почты/capability — точный поиск оставил только прошедшее время; удалённый unit-файл отсутствует; финальный lead-набор 5/5 файлов, 23/23 теста, tsc и eslint rc=0. MUST FIX 1: из двух обязательных инъекций route-тест убил выбор identity по телефону (1 failed / 13 passed), но не заметил удаление normalize/E.164-проверки из resolveVerifiedLeadApplicant.ts (14/14 green); по прямому критерию брифа снятие теста не принято. Production-код восстановлен; полный CI, DEV/TEST/PROD, миграции, live Next, merge и push не выполнялись.
```
