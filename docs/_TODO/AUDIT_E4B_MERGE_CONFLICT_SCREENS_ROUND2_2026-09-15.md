# Э4b — независимая проверка экранов конфликта, круг 2

Кандидат: `wt/merge-conflict-screens`, `754046f589497c71b08a3e46070cd0b70b28fbd8`;
проверяемые коррекции: `60b9ea84e`, `754046f58`; исходная реализация: `9e2573ca3`.
Оракул: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18б, поправка владельца 15.09.2026.

## Вердикт

**FAIL — обязательная live UI-приёмка точного кандидата не состоялась. Новых продуктовых дефектов чтением
итогового кода не найдено; Д1 и Д2 исправлены статически.**

Это отказ acceptance-gate, а не новая находка в production-коде. Скриншотов нет. Единственный общий Next
появился во время проверки, но обслуживал основной checkout, который кандидата ещё не содержит. Поднимать
candidate Next из клона или второй Next запрещено `AGENTS.md` §1a и самим brief.

Доказательство среды:

```text
/home/dev/brain/host-orch/run-tests.sh "curl -sS -o /dev/null -w 'HTTP=%{http_code}\n' http://127.0.0.1:5200/api/me"
→ HTTP=401; lock rc=0

readlink -f /proc/2039006/cwd
→ /home/dev/dev-projects/BersonCareBot/apps/webapp

git -C /home/dev/dev-projects/BersonCareBot rev-parse HEAD
→ 6c9d200686a6fc95a176e5e5e0f61ecc1b591e09

git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor 754046f58 HEAD; echo $?
→ 1

git -C /home/dev/dev-projects/BersonCareBot cat-file -e HEAD:apps/webapp/src/shared/ui/doctor/DoctorMedicalMergeConflictProvider.tsx
→ объект отсутствует
```

## 1. Живой экран

**FAIL / live не доказан.** Точный кандидат в браузере не открывался, поэтому нельзя выдать чтение JSX за
увиденные строку, модалку, focus order или четыре индикатора.

Итоговый код коррекции при этом держит требуемую структуру:

- строка клиента — `<Link href={cardHref}>` без `preventDefault`
  (`PatientsPageClient.tsx:755-794`);
- пометка конфликта — отдельный `<Button type="button">` рядом со ссылкой, не внутри неё
  (`PatientsPageClient.tsx:795-807`); оба элемента нативные и отдельно попадают в порядок клавиатурного фокуса;
- «Сегодня» — плашка-ссылка (`DoctorTodayMedicalConflictBanner.tsx:10-18`);
- «Клиенты» — `badgeKey: 'medicalMergeConflicts'`, который рисуется как danger-dot
  (`doctorNavLinks.ts:125-129`, `DoctorMenuAccordion.tsx:75-95`);
- список — destructive left border и отдельная пометка (`PatientsPageClient.tsx:755-807`);
- «Обзор» — верхняя карточка с кнопкой «Разобрать» (`PatientTabOverview.tsx:1700-1716`);
- все входы вызывают один `DoctorMedicalMergeConflictModal` из общего provider
  (`DoctorMedicalMergeConflictProvider.tsx:313-352`).

Точный поиск по затронутой строке:

```text
rg -n "preventDefault|поддержк|администратор|href=\{cardHref\}|doctor-patients-conflict" \
  apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx \
  apps/webapp/src/shared/ui/doctor/DoctorMedicalMergeConflictProvider.tsx \
  apps/webapp/src/app/app/doctor/DoctorTodayMedicalConflictBanner.tsx \
  apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.tsx \
  apps/webapp/src/shared/notifications/notificationText.ts
→ PatientsPageClient.tsx:758 href={cardHref}
→ PatientsPageClient.tsx:798 id={`doctor-patients-conflict-${c.userId}`}
→ DoctorMedicalMergeConflictProvider.tsx:241 ...«Отказать и передать администраторам платформы»
→ notificationText.ts:356 ...«Конфликт передан администраторам платформы.»
```

`preventDefault` в строке списка и текст «передать в поддержку» в поверхности Э4b не найдены.

## 2. Три исхода и сохранение индикаторов

**PASS по переиспользованному исполненному доказательству и неизменности механики; не новый live-прогон.**

Предыдущий независимый прогон записан в
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md:2890`: `200` показывает объединение; `409
awaiting_other_organization` показывает ожидание второй клиники, не закрывает модалку и отключает повторное
слияние; `403` показывает недоступность конфликта. В текущем JSX ветка `409` всё ещё вызывает `refresh()` и
`load()` без `onClose()` (`DoctorMedicalMergeConflictProvider.tsx:204-212`), а `doctorApproved` показывает
янтарное ожидание и отключает кнопку слияния (`:81-85`, `:243-249`). Поэтому pending-конфликт остаётся в
summary-индикаторах до решения второй стороны.

Коррекции не меняли серверную механику:

```text
git diff --exit-code 9e2573ca3..754046f58 -- \
  apps/webapp/src/app/api/doctor/account-merge-conflicts \
  apps/webapp/src/modules/patient-merge-candidate \
  apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts
→ exit 0
```

## 3. Чужая организация

**PASS по переиспользованному исполненному доказательству и неизменности стены; не новый live-прогон.**

Предыдущий прогон на `9e2573ca3` зафиксировал сохранённую organization-wall в той же строке очереди аудита.
После него backend не менялся (команда и `exit 0` выше). Итоговый путь по-прежнему берёт
`organizationId` только из настоящего `requireDoctorWorkspaceApiContext`, устанавливает штатный doctor principal
и передаёт этот organization scope в summary/details/actions
(`account-merge-conflicts/route.ts:7-18`, `[conflictId]/route.ts:12-30,33-73`). Репозиторий фильтрует summary
по `organizationId` и `pending`, а detail/action идут через organization-scoped двери
(`pgPatientMergeCandidate.ts:123-207`).

Новая личная browser-сессия чужой организации не создавалась: точный кандидат не был на общем runtime.

## 4. Видимые тексты

**PASS чтением всей поверхности Э4b; live-рендер не доказан.**

Модалка показывает обе стороны, ФИО, последнюю активность, назначения и дату каждого назначения; действия —
«Слить в этой организации» и «Отказать и передать администраторам платформы»
(`DoctorMedicalMergeConflictProvider.tsx:78-124,226-258`). Ожидание другой клиники прямо говорит, что решение
только записано и слияние ждёт (`:81-85`; `notificationText.ts:357-358`). Success-toast отказа говорит
«Конфликт передан администраторам платформы» (`notificationText.ts:356`). Старой формулировки про передачу
в поддержку в видимой поверхности Э4b нет. Остальные видимые строки не противоречат §18б.

## Проверки

Автоматические UI-тесты не создавались и не запускались (§10a). Полный CI не запускался по прямому запрету brief.

```text
git diff --check 9e2573ca3..754046f58
pnpm --dir apps/webapp exec eslint \
  src/app/app/doctor/patients/PatientsPageClient.tsx \
  src/shared/ui/doctor/DoctorMedicalMergeConflictProvider.tsx
→ общий exit 0, вывода нет
```

## Строка для ведущего

`wt/merge-conflict-screens | 60b9ea84e 754046f58 | ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА Э4b — FAIL acceptance-gate: Д1 и Д2 исправлены чтением итогового кода (карточка снова открывается нативной ссылкой; пометка — отдельная кнопка; тексты ведут администраторам платформы), серверные три исхода и organization-wall не менялись и переиспользуют прежнее исполненное доказательство; но точный кандидат не приземлён в единственный общий Turbopack :5200, запуск Next из клона запрещён, поэтому живой экран, клавиатура и четыре точки входа лично не увидены, скриншотов нет. Новых продуктовых findings чтением не найдено; после landing нужна live UI-приёмка на общем :5200.`
