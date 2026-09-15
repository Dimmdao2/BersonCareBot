# Независимый адверсарный аудит Л2 — кабинет заявок после landing

**Вердикт: FAIL.** Проверен candidate `9631a5e714f898309a4ae0e8e854bcde7e9e4913`
после landing `cb9eb833a`; найден один блокирующий разрыв owner-требования §9.3.

Строку вердикта в `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` этот аудит намеренно не пишет: по brief её
заносит ведущий.

## Предмет и оракул

Оракул: `LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`:

- §9.1, строки 209–216 — действующие кнопки почты/телефона, статусы с заменой из §11.3, архив;
- §9.3, строки 221–223 — KPI «Заявки» **на место** удалённых «Тестов»;
- очередь, строки 342–349 — единая фильтрованная проекция, условный шеврон/переход, полный scope Л2;
- §11.3, строки 429–436 — ровно четыре статуса, без «игнорировать».

Классификация сделана до чтения реализации: tenant wall, фильтрованная проекция, переходы, архив,
KPI-navigation и контактные действия — **ПОВЕДЕНИЕ**; React-identity черновика и физическое место KPI —
**ВЗГЛЯД**. UI проверялся только live на общем `127.0.0.1:5200`; автоматических UI-тестов нет.

## Finding

### F1 — ВЗГЛЯД — KPI «Заявки» не занял место удалённого KPI «Тесты»

**Нарушено:** план §9.3, строки 221–223, и очередь Л2, строка 349.

**Достижимый сценарий и impact:** у владельца доступны все четыре плитки. На прежнем состоянии третьим
элементом был KPI «Тесты», после замены третьим остался KPI «Задачи», а «Заявки» добавлены четвёртыми.
Человек не получает заказанную замену в том же месте и видит переставленную относительно решения владельца
последовательность.

**Evidence:** точная команда

```bash
git show 24e37bca2^:apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.tsx | nl -ba | sed -n '205,268p'
nl -ba apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.tsx | sed -n '185,260p'
```

дала старый порядок `messages · comments · tests · tasks` и текущий
`messages · comments · tasks · leads`. Live-снимок показывает тот же порядок:
[01-positive-kpi-desktop.png](/home/dev/leads-cabinet-l2-audit-20260915/01-positive-kpi-desktop.png).

Это finding, а не вкусовая рекомендация: физическое место названо в owner-строке дважды («НА МЕСТО»,
«ВМЕСТО») и повторено в scope Л2.

## Остальные пункты — PASS

| Пункт | Тип | Результат и evidence |
|---|---|---|
| Стена арендатора | ПОВЕДЕНИЕ | Список: `HTTP 200`, своих маркеров `2`, чужих `0`; чужой `id`: `GET 404`, `PATCH 404`; после PATCH строка чужой клиники осталась `new|false`. |
| Скрытая фильтром заявка | ПОВЕДЕНИЕ | При выборе фильтра, исключающего выбранную заявку: `hidden_detail_actions=0`; live показывает пустой список и «Выберите заявку»: [06-filter-hidden-no-detail-desktop.png](/home/dev/leads-cabinet-l2-audit-20260915/06-filter-hidden-no-detail-desktop.png). |
| Черновик отклонения | ВЗГЛЯД | `LeadDetail` владеет `rejecting` и `rejectionComment`; родитель рендерит `<LeadDetail key={selectedLead.id}>`. Смена `id` меняет React identity, старый экземпляр размонтируется, новый получает пустые `useState`. Без `key` React сохранил бы экземпляр в той же позиции: текст заявки сменился бы через props, а `rejectionComment` остался бы и ушёл в `onAction('reject', rejectionComment)` уже соседней заявке. |
| Статусы | ПОВЕДЕНИЕ | Live-фильтр: ровно `Все · Новая · Отклонённая · Принятая в работе · Принятая закрыта`, `ignored_present=false`: [05-status-options-desktop.png](/home/dev/leads-cabinet-l2-audit-20260915/05-status-options-desktop.png). Переходы: `accept=200`, поздний reject `409`, `close=200`, reopen `409`, reject `200`, accept rejected `409`. |
| Архив | ПОВЕДЕНИЕ | Цикл `active → archived → active` прошёл через настоящую PATCH-дверь; активная/архивная GET-проекции менялись согласованно: [07-archive-desktop.png](/home/dev/leads-cabinet-l2-audit-20260915/07-archive-desktop.png). |
| KPI при ненулевом/нулевом счётчике | ПОВЕДЕНИЕ | При `2`: `BUTTON`, шевронов `1`; при `0`: `ARTICLE`, шевронов `0`. Снимки: [positive](/home/dev/leads-cabinet-l2-audit-20260915/01-positive-kpi-desktop.png), [zero](/home/dev/leads-cabinet-l2-audit-20260915/08-zero-kpi-desktop.png). Переход разрешён только в первом состоянии. |
| Почта и телефон | ПОВЕДЕНИЕ | Клики дали `mailto:audit.l2final.a@example.test`, `tel:+79990000101`; clipboard вернул соответственно email и телефон. Меню: [почта](/home/dev/leads-cabinet-l2-audit-20260915/03-email-menu-desktop.png), [телефон](/home/dev/leads-cabinet-l2-audit-20260915/04-phone-menu-desktop.png). |
| Mobile | ПОВЕДЕНИЕ | `scrollWidth=390`, `clientWidth=390`, ошибок browser console `0`: [09-leads-mobile.png](/home/dev/leads-cabinet-l2-audit-20260915/09-leads-mobile.png). |

## Live-команда и уборка

Все DB/API/UI-действия выполнялись под обязательным host-lock одной командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash .audit-leads-l2-live.sh"
```

Финальный успешный прогон: setup `2|1` (свои|чужая заявки), override `1`; все проверки выше зелёные;
cleanup `0|0|0|0` (маркированные заявки | временная чужая организация | entitlement override |
письмо в очереди). Использована только `bcb_webapp_dev`; PROD, TEST, миграции и второй Next не затрагивались.

Общий `:5200` в момент live работал из основного `feat`-дерева на `5993b6b64`; сравнение с предметом
аудита показало в lead-scope только более позднюю правку поведения плитки «Задачи» в общем
`DoctorTodayLeftKpiRow.tsx`; блок `leads`, двери, репозиторий и кабинет относительно `9631a5e71` не менялись.

## Инъекции

Инъекции делались по одной в файлы candidate, после каждой файл возвращался к исходному содержимому.
Unit-прогоны выполнялись только под host-lock командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --filter @bersoncare/webapp exec vitest --run --project unit src/app/app/doctor/communications/tabs/leadListSelection.unit.test.ts src/app-layer/leads/withDoctorLeadsApiAccess.unit.test.ts src/modules/leads/service.unit.test.ts src/infra/repos/pgLeads.rejection.unit.test.ts"
```

| Инъекция | Тип проверяемого свойства | Сделано | Убито | Не поймано | Результат |
|---|---|---:|---:|---:|---|
| Д1: `selectedLead` снова берётся из полного `leads`, а не из `filteredLeads` | ПОВЕДЕНИЕ | 1 | 1 | 0 | Целевой `leadListSelection.unit.test.ts` покраснел: вместо ожидаемого `null` вернулась скрытая заявка `new-lead`. |
| Удалён `key={selectedLead.id}` у `LeadDetail` | ВЗГЛЯД | 1 | 0 | 1 | Разрешённый набор остался зелёным: `4` файла, `8` тестов. Это ожидаемо: поломка React identity доказывается разбором, автоматический UI-тест запрещён §10a. |
| KPI «Заявки» сделан кликабельным с шевроном при `0` | ПОВЕДЕНИЕ | 1 | 0 | 1 | Разрешённый набор остался зелёным: `4` файла, `8` тестов. Покрытие этой UI-поломки — live-проверка общего `:5200`, автоматический UI-тест запрещён §10a. |
| **Итого** |  | **3** | **1** | **2** | Непойманные инъекции не создают новую работу по тестам: применимый oracle для них уже выполнен как ВЗГЛЯД/live. |

После восстановления та же команда дала `4 passed (4)` файлов и `8 passed (8)` тестов. Побайтовое
восстановление проверено командой

```bash
sha256sum apps/webapp/src/app/app/doctor/communications/tabs/leadListSelection.ts \
  apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.tsx \
  apps/webapp/src/app/app/doctor/communications/tabs/LeadsTab.tsx
```

и исходными SHA-256 соответственно:

- `9f6ad10f832b371c4d708bef58578457a4aa25ba19c37412b3cd651a26b2c220`;
- `855c25f55d843654af3be96293a018de7a31c4e61dea7b90b7ddb53d0930a5d4`;
- `2724ca2ee223f5c6fdc50ff0f958a9ca4d592782743a7443c5c4a36d6430dee0`.

`git diff` по трём продуктовым файлам пуст. Полный CI не запускался по прямому запрету brief.
Продуктовый fix F1 аудитор не делает; блокер закрытия Л2 — вернуть KPI «Заявки» в прежний третий слот
KPI «Тесты» и провести повторную независимую приёмку этой правки.
