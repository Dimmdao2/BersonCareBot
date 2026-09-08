# Тест или взгляд

Это живая механическая приёмка уже задеплоенного TEST, а не аудит исходников. Видимость, композиция, responsive и
сохранение настроек проверяются взглядом и реальными действиями в браузере. HTTP/API outcome, сохранение после
reload, запрет direct/deep-link и отсутствие фоновых запросов проверяются через Network/console. Новые тесты,
product-code и исправления запрещены.

# TEST acceptance: C3M workspace modules and terminology

Перед действиями прочитай карту `AGENTS.md`, затем полностью §1a, §1b, §10a, §16, §17, §21, §22 и §24,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` и
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` C3M.6–C3M.8. Проверяй ровно TEST SHA
`c0690ddaac7d2abcf2f531ac0e585a405589f515`; подтверди его командой
`git -C /opt/projects/bersoncarebot-test rev-parse HEAD`. PROD не трогать.

Используй штатный вход TEST `https://test.bersoncare.ru` под существующей owner-учёткой специалиста из
`AGENTS.md` §1a. Отдельный чистый browser profile; пароль не печатай в отчёте. Не создавай fixture-аккаунтов и
клиник. До первой mutation запиши исходные значения всей секции «Рабочее пространство»; в конце восстанови их
обычным UI и подтверди reload. Если восстановление невозможно, это finding и named blocker, а не причина молча
оставить данные.

## Точные owner-пункты

- `C3M-06`: выключенный module отсутствует в sidebar/mobile nav, direct pages, card tab registry, CTA, lazy
  bootstrap/fetches, badge и poller.
- `C3M-07a`: `medical_record=OFF` убирает только продольную медкарту; Overview notes, tasks, appointments,
  encounters, files/account и исторические данные сохраняются.
- `C3M-07b`: `encounters=OFF` убирает старт/историю приёмов и visit-bound осмотр/интервенции/назначения;
  appointments и medical record продолжают работать.
- `C3M-08`: `rehabilitation=OFF` убирает program/catalog paths, widgets и зависимые comment/media surfaces.
- `C3M-09`: выключенные communications/mailings не оставляют вкладки, unread, snapshot/poller или рабочий direct
  write path.
- `C3M-11`: одно сохранённое название `Клиенты|Пациенты` и `Избранные|На сопровождении` проецируется через общий
  terminology layer во все реально посещённые экраны; данные и `onSupport` от переименования не меняются.
- `C3M-12`/C3M.8: OFF→ON возвращает существующие данные без mutation; `medical_record` и `encounters` проверяются
  во всех четырёх сочетаниях; preference не расширяет tariff/capability availability.

## Механический маршрут

1. Desktop 1440×1000: войди, открой Сегодня, список клиентов, карточку реального клиента, Расписание,
   Коммуникации, Аналитику и Настройки. Сними baseline и console/network baseline.
2. В «Рабочем пространстве» по очереди проверь четыре комбинации `medical_record × encounters`: ON/ON, OFF/ON,
   ON/OFF, OFF/OFF. После каждого Save обязательно reload и новый прямой переход к карточке/visit URL. Проверяй
   не только меню, а отсутствие/наличие нужных вкладок, CTA «начать приём», истории приёмов и медкарты; существующие
   записи/симптомы/приёмы должны вернуться после re-enable.
3. Выключи rehabilitation: проверь sidebar/mobile nav, карточку клиента, каталоги/программы, зависимые вкладки
   коммуникаций и прямые URL. Затем включи и подтверди возврат тех же данных.
4. Выключи/включи chat, comments/media и mailings только в пределах module switches, доступных на этом экране.
   Зафиксируй вкладки, unread/poller/network и direct navigation. Не отправляй реальные рассылки.
5. Переключи `Клиенты→Пациенты`, затем `Избранные→На сопровождении`. После Save+reload пройди те же реально
   доступные страницы: Today, список/фильтр, карточка, календарь, коммуникации, аналитика, CMS/settings. Зафиксируй
   каждый остаточный неверный термин точным URL и screenshot; не считай технические идентификаторы UI-текстом.
6. Повтори критичные состояния на viewport 390×844: mobile nav, список, карточка и settings. Не оценивай вкус;
   finding только clipping/недоступное действие/неверное поведение.
7. Восстанови исходные настройки, reload, повторно проверь основные страницы.

Сохраняй screenshots и report вне git checkout:
`/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/c3m-modules/`.
В отчёте: шаг, URL, роль, исходное→временное→восстановленное значение, видимый outcome, network status/body без
секретов, console error, screenshot filename. Сначала собери ВСЕ findings; ничего не исправляй. Один итог
PASS/FAIL/UNPROVED по каждому пункту. Не запускай CI, миграции, deploy, dev server, worker/fixer и не коммить.
