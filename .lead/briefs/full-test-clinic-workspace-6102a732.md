# Тест или взгляд

Это живой browser walkthrough composition/permissions уже задеплоенного кода. Layout/navigation проверяются
взглядом, permissions — реальным доступом/отказом и reload. Никаких UI/source/count tests, product fixes или
изобретённой clinic-calendar работы.

# TEST acceptance: solo/clinic management workspace

Прочитай карту `AGENTS.md`, затем полностью §1a, §1b, §10a, §16–§17, §21–§22 и §24,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` и весь
`docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md`. Проверяй TEST SHA
`c0690ddaac7d2abcf2f531ac0e585a405589f515`. Используй существующую owner doctor account из §1a и отдельный
browser profile. Если TEST data не содержит нужной clinic composition/second member, разрешён дополнительный
read/mutation walkthrough того же owner account на уже работающем DEV `:5200`, но не создавать fixture members,
не приглашать посторонних и не запускать server. В отчёте каждый факт помечай TEST или DEV.

## Точные пункты плана

- §3.1: solo не видит Team/admin mode; Settings имеет Clinic, specialist profile, services/place, online booking,
  workspace, channels, tariff; Schedule — Appointments, Working hours, Packages.
- §3.2: clinic specialist работает только в scope `mine`, не видит clinic catalog/settings/package templates;
  owner/admin-specialist имеет switch «Работа специалиста / Управление клиникой»; admin без specialist binding
  попадает прямо в management.
- §3.3/M2–M4: management переиспользует Team, Catalog, Online booking, Analytics, clinic settings and Tariff;
  никаких пустых placeholder sections.
- §4: публичный specialist profile один; solo редактирует его в Settings, clinic owner/admin — Team→specialist.
- M1/DoD: `appointments.manage_own` и `availability.manage_own` реально ограничивают mutation сервером и UI.
- §7/M6: branch timezone picker ищет offset `+3`, `+5` и русский город, показывает UTC hint, сохраняет IANA и
  использует единую реализацию.
- M5 отложен владельцем: общего clinic appointment calendar сейчас не требовать и его отсутствие не finding.

## Механический маршрут

1. TEST desktop: обычный вход, определи фактическую composition через UI, не по предположению. Сними doctor nav,
   Schedule tabs, Settings и наличие/отсутствие mode switch. Перейди прямыми URL `/app/doctor/**` и `/app/manage`.
2. Если clinic owner/admin-specialist: переключись в management и обратно; проверь Team, Catalog,
   Online booking, применимые Analytics/Settings/Tariff. Management route не должен расширять doctor scope.
   Если management-only member доступен существующей учёткой — проверь direct landing без doctor mode; не создавай
   такую учётку ради проверки.
3. Team: открой существующего specialist, проверь один public description/assignments writer. Если безопасно,
   измени description минимальным reversible suffix, Save+reload, проверь public/booking projection, затем верни
   исходное значение и reload.
4. Catalog: service/branch/package writers должны быть существующими, без дубля. На существующем branch открой
   timezone picker, найди `+3`, `+5` и русский город. Если можно безопасно восстановить исходное значение — выбери
   другой IANA, Save+reload, затем restore+reload. Не создавай постоянный branch/service/package.
5. При наличии второго specialist проверь обе permissions: выключенное действие исчезает/disabled и direct
   mutation отказывает; включение возвращает только собственное действие. Сохрани baseline и восстанови. Если нет
   второй реальной membership — UNPROVED, не fixture.
6. При наличии solo organization в существующем organization switcher пройди solo Settings и три Schedule tabs.
   Если нет — не подделывай seat/entitlement и зафиксируй UNPROVED.
7. Mobile 390×844: mode switch, management nav, Team/Catalog/Online booking и doctor nav без clipping.
8. Обязательный owner-regression check: последовательно нажать **каждый видимый пункт** management menu, включая
   все вложенные пункты каталога (`Филиалы`, `Услуги`, `Абонементы`). Для каждого пункта снять экран и назвать
   видимый заголовок/содержимое, подтверждающее открытие именно выбранного раздела. Изменившийся URL, active-state
   меню или подсветка без смены содержимого — FAIL. Отдельно подтвердить, что переход между `Работа специалиста`
   и `Управление клиникой` находится внутри меню рядом с настройками и отсутствует в шапке.
9. Сравнить management booking sections с прежней поверхностью `Расписание → Настройки`: одинаковые боковые
   отступы, контейнер и стили существующих блоков; синие рамки вокруг перенесённых блоков — FAIL.
8. После всех mutations восстанови исходные значения и приложи reload proof.

Artifacts: `/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/clinic-workspace/`.
В отчёте нужны route/action/outcome, screenshot filenames, console/network errors, TEST/DEV data limitations,
cleanup. Сначала собрать все defects; ничего не исправлять. Не запускать CI, migrations, deploy, dev server,
workers, не менять/коммитить код.
