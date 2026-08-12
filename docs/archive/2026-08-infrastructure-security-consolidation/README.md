# Infrastructure security plans — archive after consolidation

Архив создан при сведении инфраструктуры и эксплуатационной безопасности в единый
[`INFRASTRUCTURE_SECURITY_PLAN.md`](../../_TODO/INFRASTRUCTURE_SECURITY_PLAN.md).

Все файлы ниже **не исполняются**. Они сохранены целиком как provenance: старые формулировки, исследования,
датированные статусы и evidence. При конфликте действует новый план и более поздние owner-решения.

## Карта переноса «откуда → куда»

| Прежний активный документ | Куда перенесено действующее содержание | Архивная копия |
| --- | --- | --- |
| `docs/_TODO/SECURITY_CI_STACK_PLAN.md` | Новый план §I5 | [`SECURITY_CI_STACK_PLAN.md`](SECURITY_CI_STACK_PLAN.md) |
| `docs/_TODO/CRYPTO_INFRA_SEC_WORK_SPLIT_2026-07-27.md` | Классификация устранена; требования разнесены по §I0–I7 | [`CRYPTO_INFRA_SEC_WORK_SPLIT_2026-07-27.md`](CRYPTO_INFRA_SEC_WORK_SPLIT_2026-07-27.md) |
| `RU_PRIVACY.../TOOLING_AND_HOST_PACKAGES.md` | Package/tool measures сведены в §I1, §I5 и §I6 | [`TOOLING_AND_HOST_PACKAGES.md`](TOOLING_AND_HOST_PACKAGES.md) |
| `stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md` | Новый план §I0, §I1 и §I7 | [`stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md`](stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md) |
| `stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md` | Новый план §I0, §I2 и §I3; selected field encryption сохранён как отдельный decision I2-10 | [`stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md`](stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md) |
| `stages/DR-01_BACKUP_AND_RECOVERY.md` | Новый план §I3 | [`stages/DR-01_BACKUP_AND_RECOVERY.md`](stages/DR-01_BACKUP_AND_RECOVERY.md) |
| `stages/SEC-02_HOST_AND_SECRETS.md` | Новый план §I1, §I4 и §I6 | [`stages/SEC-02_HOST_AND_SECRETS.md`](stages/SEC-02_HOST_AND_SECRETS.md) |
| `stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md` | Инфраструктурная часть в §I4 и §I6; clinical access остаётся в `SEC-03` | [`stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md`](stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md) |

Не переносились как инфраструктурные требования: RLS/grants/DB-port architecture, product admin/support access,
patient purge, consent/DSAR/legal texts. Их актуальные владельцы перечислены в границах нового плана.
