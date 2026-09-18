# Тест или взгляд — S11 payment lifecycle/outbox, первичный аудит кандидата

Сначала прочитай `AGENTS.md`: карту, §1 migrations, §5 common passage/clean architecture, §10a и §10b
целиком, §24. Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, этап S11
`PAY-REL-01..03` и `PAT-NOTIF-01..03`, а также `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §21 и §24.1.
Проверяемый committed candidate: `843983ff5c125502c953958b37e6b18c16cd8a5c` от базы
`97c8a7f3e`. Не подтягивай свежий `feat` и не меняй предмет проверки.

## Сначала классификация

- Взглядом: атомарная граница provider-event/canonical settlement/durable lifecycle work; повторное
  использование существующей очереди и inbox; отсутствие второго notification store; архитектурные границы;
  полный inventory реально существующих patient-visible booking/visit/payment producers.
- Поведенческим тестом только при независимом oracle и дорогом молчаливом отказе: принятый webhook не теряет
  lifecycle job при падении процесса; повтор не дублирует inbox/деньги/внешнее сообщение; отключённый внешний
  канал не гасит persistent inbox/calendar/reminders; transient consumer failure остаётся retryable; уже успешный
  шаг не повторяется из-за сбоя другого шага; разные существующие источники сходятся в тот же Notifications feed.
- Не писать UI/DOM/copy/source-string/SQL-text тесты. Если требование дешевле и честнее доказывается взглядом,
  тест не создавать.

## Порядок аудита

1. До чтения существующих тестов составь blind kill-set по authority.
2. Инспектируй весь diff `97c8a7f3e..843983ff5`, затем окружающий production path от webhook до конечных
   side effects и patient Notifications.
3. Сопоставь каждый S11 ID с фактически работающим путём. Самоотчёт worker не является доказательством.
4. Недостающие допустимые acceptance-тесты добавь один раз на самом дешёвом публичном слое. Падающий на
   candidate тест оставь как handoff; для зелёного сделай одну fault injection на независимый класс и откати
   временную production-поломку.
5. Создай audit artifact `docs/_TODO/runs/s11-lifecycle-outbox-audit1.md`: PASS/FAIL, findings только с
   достижимым сценарием и impact, таблица S11 IDs, команды и результаты, kill-set с числом убитых/непойманных.
6. Допустимы только намеренные acceptance-тесты и audit artifact. Product fix не делай. Закоммить явные пути
   до конца единственного хода; рабочее дерево оставь чистым.

Ожидаемый исход для неполного кандидата — честный FAIL с фиксированным oracle для continuation-worker, а не
смягчённый PASS. Не запускать full CI, live server, deploy или push.
