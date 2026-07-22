# RU Privacy & Production Readiness

Статус: **OWNER-ACTIVATED / DEV EXECUTION** с 2026-07-19. Технические, кодовые и безопасные DB-slices выполняются
на DEV по реестру `PR-00`; production-host hardening, production data migration и любые production mutations
остаются отдельным owner-gated cutover. Инициатива не меняет утверждённый порядок SaaS Foundation.

## Зачем создана инициатива

Собрать в одном исполнимом плане работы, которых нет в текущем product/SaaS roadmap:

- доказуемая обработка российских персональных данных, включая сведения о здоровье;
- согласия, права субъекта, сроки хранения и удаление;
- защита production-хоста, секретов, резервных копий и S3;
- controlled app-push delivery, messenger auth-only boundary и очистка вторичных copies в logs/queues;
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

Связанная отдельная product/engineering initiative для полноценного Android/iOS приложения:
[`../NATIVE_MOBILE_APP_INITIATIVE/README.md`](../NATIVE_MOBILE_APP_INITIATIVE/README.md). Она не встраивается в
активные SaaS/Product UX stages; privacy-план задаёт только обязательную channel/content/provider boundary.

## Защищённая граница текущих работ

Эта инициатива **не меняет** содержание, порядок или логи уже исполняемых работ:

- `docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md`;
- `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md`;
- `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md`;
- `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/*`;
- фактически активные taskdb stages и их рабочие ветки/логи по current taskdb/agent/worktree census. Датированный
  список `#23/#773–775/#803/#885` больше не является protected-active authority: часть карточек завершена,
  superseded/cancelled либо возвращена в `todo`; совместимый `/book/{publicSlug}` residual остаётся `#805`.

Завершённый FIO scope `#856` остаётся защищённой стабильной зависимостью и не переоткрывается этой инициативой.

`#888` закрыт и принят; его результат можно использовать только как stable dependency. Незакрытые D3/D4/S5-7,
billing и перечисленные активные задачи остаются защищёнными scopes.

Инициатива потребляет их закрытые результаты как зависимости. Перекрёстные ссылки в активные планы добавляются
только после закрытия соответствующего этапа либо по прямому решению владельца.

## Граница активированного исполнения

- Реестр статусов и self-contained launch manifests: [`stages/PR-00_SCOPE_LOCK.md`](stages/PR-00_SCOPE_LOCK.md).
- Сейчас разрешены DEV/repository-only slices, явно помеченные там `executable_now`: `SEC-01`, фактический `PR-01`,
  безопасные repository slices `SEC-02`/`DR-01`, `CRYPTO-01/C0`, `NTF-01/N0`, `LOG-01/L0-L1` и временное закрытие
  administrative hard-delete с negative guard `PR-03A0`.
- Application-level безопасность, consent, audit, retention, crypto и CI не откладываются из-за будущего переноса
  production-хоста; они идут сразу после своих D4/S5/legal gates.
- Шифрование диска, firewall/SSH/systemd/packages/secrets на реальном production-хосте, реальные backup/restore,
  production DB/backfill и cutover остаются `prod_host_later` и требуют отдельного `G-11`.

До закрытия `G-05/G-05A` не расширяются цели health-data processing, список получателей/подрядчиков и onboarding
новых организаций с health data. Изменения БД, API, UI и прав доступа выполняются только в DEV после своих
dependency/owner gates. Изменения systemd/firewall/production backup и production-конфигурации до rehearsal и
`G-11` запрещены.
