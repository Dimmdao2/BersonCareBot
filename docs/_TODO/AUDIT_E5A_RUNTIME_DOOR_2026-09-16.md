FAIL — 5 MUST FIX

# Закрывающий аудит Э5a: runtime-дверь

Дата: 16.09.2026. Кандидат: `d8fd2a16ac53a53637816115df0d3917b6817645`, ветка
`wt/e5-email-gate`. Оракул: `E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-200` — до подтверждения
почты доступны только привязка, повторная отправка кода, поддержка и выход; клинические данные закрыты;
текущие сессии не инвалидируются, новые сессии без почты идут в ограниченный gate.

Статический анализатор `check-patient-api-business-access-door.mjs` не проверялся и не восстанавливался:
владелец 16.09 приказал удалить его (`E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:236-248`). Предмет этого
аудита — наблюдаемое поведение runtime-двери.

## MUST FIX

### MF-1 — новая сессия без подтверждённой почты получает клинические данные 14 дней

**Оракул:** `E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197`: «до первого открытия защищённого
кабинета», «клинические данные до завершения не показываются».

**Достижимый сценарий:** для `client` без confirmed email и с `email_first_requested_at = NULL`
`resolvePatientEmailGateDecision` возвращает `request`, а `resolvePatientEmailGatePolicy` выставляет
`blocksProtectedData: false` (`patientRouteApiPolicy.ts:49,141-180`). Layout один раз отправляет на
`/app/patient/bind-email` (`patient/layout.tsx:100-108`), но экран показывает «Позже» и возвращает на
исходный clinical path (`bind-email/page.tsx:41-49,67-76`). Прямой API-вызов даже не обязан пройти layout:
`requirePatientApiBusinessAccess` пропускает его при `blocksProtectedData=false`
(`requireRole.ts:1029-1049`).

Что получает такой пациент вместо `403 patient_email_required`:

- дневник `/api/patient/diary/quick-add-context` — `200` со своими tracking/complex rows;
- программы `/api/patient/treatment-program-instances` — `200` со списком программ;
- рейтинги `/api/patient/material-ratings` — `200` с aggregate и `myStars`;
- переписка `/api/patient/messages` — `200` с conversation/messages/unread count;
- файлы `/api/media/[id]`, playback/preview/HLS и patient program-submission status — байты,
  playback JSON либо метаданные после существующей media ACL.

Красный acceptance-test с независимым owner-оракулом:

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/platform-access/patientEmailImmediateGate.unit.test.ts"
→ 1 file failed; 4/4 clinical paths failed: expected blocksProtectedData=true, received false.
```

### MF-2 — дверь не различает уже живую и новую сессию

**Оракул:** `E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:198-200`: текущие сессии не инвалидировать,
новые без почты направлять в ограниченный gate.

**Достижимый сценарий:** layout безусловно применяет одну политику к любой cookie-сессии
(`patient/layout.tsx:71-108`). Вход политики содержит только `sessionRole`, `pathname`, текущее время и
account-level `email_first_requested_at`; `issuedAt`/момент создания сессии отсутствует
(`patientRouteApiPolicy.ts:39-47,141-180`, `app-layer/platform-access/index.ts:39-75`). Поэтому уже
живущая до выката сессия сначала получает redirect на bind-email, запускает тот же account timer, а через
14 дней теряет clinical access наравне с новой. Cookie явно не очищается, но требование «не выбрасывать
пациента, который уже внутри» не выполнено: различить две owner-категории код не способен.

### MF-3 — allowlist шире четырёх разрешённых действий

**Оракул:** `E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197`: «разрешены лишь экран привязки,
повторная отправка кода, поддержка и выход».

Политика дополнительно освобождает весь `/app/patient/profile`, `/app/patient/help/**` и `/legal/**`
(`patientRouteApiPolicy.ts:51-63`). Это не синоним четырёх разрешённых действий. В частности,
patient profile APIs передают `returnPath=/app/patient/profile`, поэтому exemption применяется не только
к email bind, но и к FIO/calendar-timezone операциям. Существующий тест прямо закрепляет семь exempt paths,
включая эти три лишние группы (`patientEmailGatePolicy.unit.test.ts:67-84`).

При этом четыре обязательных выхода сами доступны:

- bind-email: exempt path + `requirePatientAccess`, экран рендерится;
- resend: `/api/auth/email/start` требует сессию, но не вызывает email door;
- support: page exempt, `/api/patient/support` не вызывает email door;
- logout: `/api/auth/logout` напрямую очищает сессию и редиректит.

### MF-4 — сохранённые тесты подогнаны под ошибочную 14-дневную реализацию

**Оракул:** тот же `E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197`; правило тестов — AGENTS.md
§10a «Линейка владельца (15.09)»: тест, который надо менять при честной правке кода, держит форму
реализации, а не требуемый выход.

Зелёный набор утверждает противоположное owner-оракулу:

- `patientEmailGatePolicy.unit.test.ts:26-44,99-143` требует `request`/open data до day 14;
- `requireRole.patientEmailGate.unit.test.ts:102-109` требует открытые diary/messages двери в soft period;
- `material-ratings/route.route.test.ts:143-154` требует `200` с personal rating;
- `organization-context/route.route.test.ts:67-83` требует `200` с organization context.

Честная правка MF-1 обязана переписать или удалить эти expectations. До добавленного красного owner-test
все релевантные наборы были зелёными именно при реальной утечке:

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/platform-access/patientEmailGatePolicy.unit.test.ts src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts && pnpm --dir apps/webapp exec vitest run --project=route src/app/api/patient/material-ratings/route.route.test.ts src/app/api/patient/organization-context/route.route.test.ts"
→ unit 2 files / 21 tests passed; route 2 files / 8 tests passed.
```

### MF-5 — ошибки разрешённых действий содержат строки вне notificationText

**Оракул:** AGENTS.md §21a: любой ожидаемый видимый отказ берётся из
`notificationText.ts`, одинаковый смысл имеет один ключ. Gate-отказ сделан правильно:
`requireRole.ts:957-968` использует `notificationText.patientEmailRequired`, а
`errorCodeText.ts:34` мапит `patient_email_required` на тот же ключ.

Но необходимые человеку выходы из gate нарушают тот же обязательный контракт:

- resend `/api/auth/email/start`: inline-строки в `errMsg` (`route.ts:78-91`);
- bind screen `EmailAccountPanel`: inline fallbacks «Не удалось отправить код»/«Ошибка»
  (`EmailAccountPanel.tsx:86,362,392,442`);
- patient email confirm: inline expired/conflict строки (`patient/email-change/confirm/route.ts:100-113`);
- support: inline `invalid_message` (`patient/support/route.ts:110-118`).

Человек действительно видит эти `message`/fallback значения. Механический сторож этого не заметил:

```text
/home/dev/brain/host-orch/run-tests.sh "node apps/webapp/scripts/check-notification-text-coverage.mjs"
→ notification text coverage: OK
```

Это не отменяет §21a: сам раздел прямо говорит, что непойманное сторожем не разрешено.

## Каталог поломок и инъекции

Fault injection выполнялся временными правками production-кода; все правки откатились до формирования
коммита. Итог: **убито 11 из 11, непойманного 0**.

| Fault | Наблюдаемое красное доказательство |
|---|---|
| Снять email refusal с server action/RSC guard | `requireRole.patientEmailGate.unit.test.ts`: 1 test failed, diary promise разрешился вместо redirect |
| Снять email refusal с API guard | тот же файл: 2 tests failed, API/optional aggregate вернули `ok:true` |
| Подменить policy `blocksProtectedData=false` после deadline | `patientEmailGatePolicy.unit.test.ts`: 1 test failed |
| Убрать exemptions bind/support/logout | тот же файл: 7 tests failed |
| Обойти door в diary route | `runtimeDoor.route.test.ts`: diary test failed до clinical dependency |
| Обойти door в treatment-program route | тот же файл: treatment test failed |
| Обойти door в messages route | тот же файл: correspondence test failed |
| Обойти door в program-submission file-status route | тот же файл: program file test failed |
| Обойти door в material-ratings route | `material-ratings/route.route.test.ts`: refusal test failed |
| Обойти door в organization-context route | `organization-context/route.route.test.ts`: refusal test failed |
| Обойти door в `/api/media/[id]` | `mediaDeliveryChokepoint.route.test.ts`: новый refusal test failed до media authorization |

Команды инъекционных прогонов (все через host lock):

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/platform-access/patientEmailGatePolicy.unit.test.ts"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=route src/app/api/patient/runtimeDoorAudit.route.test.ts"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=route src/app/api/patient/material-ratings/route.route.test.ts src/app/api/patient/organization-context/route.route.test.ts"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=route src/app/api/media/[id]/mediaDeliveryChokepoint.route.test.ts"
```

Имя временного `runtimeDoorAudit.route.test.ts` после инъекций заменено сохраняемым
`runtimeDoor.route.test.ts`; временного файла в дереве нет.

## Census живых маршрутов и взгляд на сессии

Команда:

```text
route_files=$(rg --files apps/webapp/src/app/api/patient | rg '/route\.ts$'); printf '%s\n' "$route_files" | wc -l; printf '%s\n' "$route_files" | xargs rg --files-without-match 'requirePatientApiBusinessAccess|requirePatientBookingTrustedPhoneAccess|requirePatientAccess' | sort
```

Результат: **71** patient route-файл; без общей business/session двери только три намеренных escape/onboarding
route: `email-change/confirm`, `messenger/request-contact`, `support`. Общие media delivery routes
`/api/media/[id]`, playback, preview и HLS отдельно вызывают `requirePatientApiBusinessAccess`; это подтверждено
чтением цепочки и route-инъекцией, а не бывшим синтаксическим анализатором.

Сессия при gate refusal не очищается: код сохраняет session cookie и переводит на bind-email. Поэтому узкая
механика «не logout/не revoke» работает, но owner-разделение старой и новой сессии не работает (MF-2).

## Финальная проверка audit-artifacts

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project=unit src/modules/platform-access/patientEmailGatePolicy.unit.test.ts src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts && pnpm --dir apps/webapp exec vitest run --project=route src/app/api/patient/runtimeDoor.route.test.ts src/app/api/patient/material-ratings/route.route.test.ts src/app/api/patient/organization-context/route.route.test.ts src/app/api/media/[id]/mediaDeliveryChokepoint.route.test.ts"
→ unit: 2 files / 21 tests passed; route: 4 files / 24 tests passed.

pnpm --dir apps/webapp exec eslint 'src/app/api/media/[id]/mediaDeliveryChokepoint.route.test.ts' src/app/api/patient/runtimeDoor.route.test.ts src/modules/platform-access/patientEmailImmediateGate.unit.test.ts
→ exit 0.
```

Красный `patientEmailImmediateGate.unit.test.ts` намеренно не включён в зелёную группу: это сохранённый
acceptance-test текущего MUST FIX MF-1, его отдельный результат — 1 file failed / 4 tests failed, приведён выше.

## Итог

После наступления реализованного deadline общая дверь действительно останавливает проверенные clinical routes,
четыре escape-действия достижимы, а `patient_email_required` использует общий словарь. Кандидат всё равно **FAIL**:
deadline и область exemptions противоречат owner-оракулу, живые сессии не отличаются от новых, зелёные тесты
закрепляют этот конфликт, а тексты отказов обязательных escape-flow обходят §21a.

Не запускались: миграции, DEV/TEST/PROD runtime, второй Next, автоматические UI-тесты, полный CI.
Строка вердикта в `feat` не записывалась.
