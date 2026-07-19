# RU Privacy & Production Readiness

Статус: **DRAFT / OWNER REVIEW**. Инициатива находится в `_TODO`, не исполняется оркестратором и не меняет
утверждённый порядок SaaS Foundation.

## Зачем создана инициатива

Собрать в одном исполнимом плане работы, которых нет в текущем product/SaaS roadmap:

- доказуемая обработка российских персональных данных, включая сведения о здоровье;
- согласия, права субъекта, сроки хранения и удаление;
- защита production-хоста, секретов, резервных копий и S3;
- аудит доступа, реагирование на инциденты и итоговый production readiness gate.

Это **не юридическое заключение** и не обещание автоматического соответствия 152-ФЗ. Технические доказательства
готовят агенты; правовые основания, тексты документов, роли оператора/обработчика и итоговый go/no-go утверждают
владелец и профильный юрист/специалист по защите ПДн.

## Канон инициативы

1. [`REQUIREMENTS.md`](REQUIREMENTS.md) — границы и обязательные результаты.
2. [`MASTER_PLAN.md`](MASTER_PLAN.md) — порядок, зависимости, оценки и Definition of Done.
3. [`OWNER_AND_LEGAL_GATES.md`](OWNER_AND_LEGAL_GATES.md) — единый лист решений владельца и юриста.
4. [`OWNER_ACTIONS.md`](OWNER_ACTIONS.md) — конкретные действия владельца, сроки, готовый тикет Selectel и evidence.
5. [`CURRENT_PROD_BASELINE_2026-07-19.md`](CURRENT_PROD_BASELINE_2026-07-19.md) — подтверждённый обезличенный
   снимок реального production-хоста и S3.
6. [`TOOLING_AND_HOST_PACKAGES.md`](TOOLING_AND_HOST_PACKAGES.md) — что уже зафиксировано/установлено и что
   требуется внедрить.
7. [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md) — единый release gate.
8. [`stages/`](stages/README.md) — подробные чек-листы исполнения, включая crypto и encrypted PROD cutover.
9. [`EVIDENCE/README.md`](EVIDENCE/README.md) — правила и индекс доказательств.
10. [`LOG.md`](LOG.md) — только новые факты исполнения; история не переписывается.

## Защищённая граница текущих работ

Эта инициатива **не меняет** содержание, порядок или логи уже исполняемых работ:

- `docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md`;
- `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md`;
- `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md`;
- `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/*`;
- задачи taskdb `#23`, `#751`, `#773–775`, `#803`, `#805`, `#856`, `#885` и их рабочие ветки/логи.

`#888` закрыт и принят; его результат можно использовать только как stable dependency. Незакрытые D3/D4/S5-7,
billing и перечисленные задачи остаются защищёнными active scopes.

Инициатива потребляет их закрытые результаты как зависимости. Перекрёстные ссылки в активные планы добавляются
только после закрытия соответствующего этапа либо по прямому решению владельца.

## Что можно начать сейчас

- `PR-00` — read-only baseline и реестр пробелов;
- `PR-01` — карта обработки, немедленная сверка РКН и interim legal containment без ПДн в репозитории;
- существующий `SEC-01`, taskdb `#881` — Security CI;
- read-only preflight для `SEC-02` и проектирование `DR-01`.
- crypto/host ADR, owner/provider packets и repository-only проектирование `CRYPTO-01`/`INFRA-01` без изменения
  active application files и без production mutations.

До закрытия `G-05/G-05A` не расширяются цели health-data processing, список получателей/подрядчиков и onboarding
новых организаций с health data. Изменения БД, API, UI, прав доступа, systemd, firewall, backup и production-конфигурации до прохождения своих
dependency/owner gates запрещены.
