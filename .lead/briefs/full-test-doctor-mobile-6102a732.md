# Тест или взгляд

Это живая механическая приёмка кабинета специалиста и карточки пациента. Визуальные требования принимаются
реальным desktop/mobile просмотром, устойчивые действия — Save/reload/return path и Network. UI/source/count/text
tests, product fixes и вкусовые замечания запрещены.

# TEST acceptance: doctor workspace, patient card and mobile flows

Прочитай карту `AGENTS.md`, затем полностью §1a, §1b, §10a, §16–§22 и §24,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`,
`docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md` и выполненные разделы A–O/P1–P3/Q/S в
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`. Проверяй TEST SHA
`c0690ddaac7d2abcf2f531ac0e585a405589f515`, только existing owner accounts/data из `AGENTS.md` §1a.
Отдельный clean profile; PROD не трогать.

Не требуй отложенные пункты: полную новую clinical layout P4, незавершённые MODAL-02/04/05,
CONTACTS-12/13, UI-7 и другие открытые owner-gates. В споре current card authority —
`bersoncare-карточка-пациента-CURRENT-SPEC.md`.

## Механический маршрут

1. Desktop 1440×1000: Today, список клиентов, поиск/фильтры, строка со звездой/unread, переход в реальную карточку.
   Зафиксируй loading/runtime/network. Проверь sticky header/tabs, FIO+birth date, actions, Overview, program,
   files, account и реально доступные clinical/visit surfaces без требования скрытых C3M-модулей.
2. Today: nearest appointment, weekly chart, support/messages/comments/tasks KPIs; клики ведут в правильного клиента
   и правильный context. Background refresh не должен терять состояние или давать 4xx/5xx.
3. Patient Overview: заметка — create/edit/save/reload/delete только штатными действиями. Task — create/edit,
   empty title validation, complete/uncomplete или delete по доступному contract; новая задача жёстко привязана к
   выбранному пациенту. Удалить временные данные и приложить cleanup proof.
4. Visits/program/comments: открыть существующий visit и exercise/comment thread; проверить modal title contract,
   patient link, unread read-state, canonical chat. Не фабриковать unread. Если реальных unread нет — UNPROVED.
5. Files/account: empty/list/internal scroll/preview; personal data modal, structured FIO/date/sex; contacts only
   фактические; Telegram/Max actions не должны вести во внутренний чат. Не block patient. Archive разрешён только
   если штатный restore заранее найден и затем выполнен.
6. Mobile 390×844: повторить Today→patient list→card; открыть exercise/recommendation/statistics/chat/visits/task/
   account/file modals, проверить stack/back/footer/safe-area и отсутствие Safari zoom/clipping. Закрытие одного
   слоя не должно сбрасывать предыдущий context.
7. Вернуться к desktop, reload и подтвердить, что временные note/task/file/archive states очищены.
8. Обязательный owner-regression check: на `Обзор` нет редактируемого блока настроек сопровождения и отдельного
   блока `Симптомы дневника` над `История приёмов` / `Начать приём`; KPI `Задачи` не вытеснен. В `Учётке` кнопка
   открывает настройки сопровождения только в модалке. В модалке каждого конкретного симптома есть единственный
   переключатель `Отслеживание пациентом/клиентом`; переключить, сохранить, перезагрузить, подтвердить состояние и
   вернуть исходное значение.

Screenshots/report: `/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/doctor-mobile/`.
Для каждого FAIL: owner ID/route/action/visible impact, screenshot, Network status/body без секретов и console.
Сначала собрать все defects; ничего не исправлять. Не запускать tests/CI/migration/deploy/dev server, не менять и
не коммить product code.
