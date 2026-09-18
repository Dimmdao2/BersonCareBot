# Тест или взгляд — S11 core outbox candidate после correction

Прочитай `AGENTS.md`: карту, §1 migrations, §5, §10a–§10b целиком и §24. Authority:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S11 `PAY-REL-01..03`,
`PAT-NOTIF-01..03`; `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §21/§24.1; первичный blind artifact
`docs/_TODO/runs/s11-lifecycle-outbox-audit1.md`. Exact candidate: `1daecd17bcaddcda8f2c6e151f6c3617123cf3d0`
от integration base `d4cce29f6` с сохранёнными audit tests `17c9df6cc`. Не подтягивай свежий feat.

## Классификация и scope

- Не повторяй уже выполненный blind-pass/FI K1–K5/K9. Сначала прогони сохранённый oracle; его зелёность —
  prerequisite, не новый аудит.
- Взглядом и, только при независимом oracle, поведением проверь НОВУЮ поверхность candidate:
  forward migration atomic settlement+queue insert; stable unique event id; privilege declaration/generated SQL;
  internal `booking_lifecycle` claim/reclaim/finalize; retry/backoff/dead/operator incident; отсутствие `dispatching`
  для повторяемой internal work; payload tenant/scope; consumer вызывает существующий common lifecycle passage;
  post-commit callback больше не является гарантией captured payment.
- Отдельно сверяй оставшийся producer inventory из F5 и из owner scope: confirmed/awaiting-payment creation,
  staff manual, reschedule, cancel/no-show, due reminder, online/cash capture, refund/retention, реально существующие
  patient-visible visit facts. Отсутствующий в product producer — не придумывать; указать evidence.
- Никаких UI/DOM/copy/source/SQL-text тестов. Migration privileges проверяются генератором/static gates и
  introspection позже лидом на именованной DEV, а не тестом текста SQL.

## Результат

Создай `docs/_TODO/runs/s11-lifecycle-outbox-audit2.md` с бинарным verdict по core candidate и отдельной таблицей
оставшихся S11 IDs/producer gaps. Finding только для достижимого нарушения owner requirement/repo rule. Если
нашёл допустимый недостающий behavioral oracle новой поверхности — добавь один раз на самом дешёвом публичном
слое, сделай fault injection и откати временную production-поломку. Product fix не делать.

Запусти сохранённые audit1 acceptance-наборы, новые применимые focused worker/payment tests, webapp/integrator
typecheck, migration order/privilege generated gates. Не full CI, не live server/DB, не deploy/push. Закоммить
только намеренные tests/audit artifact явными путями и оставь чистое дерево. PASS core при незакрытом inventory
не является PASS всего S11: вердикты раздели явно, чтобы continuation-worker получил точный handoff.
