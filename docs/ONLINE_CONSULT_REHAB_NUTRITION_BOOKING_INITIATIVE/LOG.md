# Журнал: онлайн-запись (реабилитация, нутрициология)

## 2026-06-04 — отмена автозаписи

- Решение: **не** реализовывать автозапись и отдельный контур слотов для онлайн реаб / нутри — только **запрос/обращение** пациента.
- Пункт `online-consult-slots-rubitime-misroute` в [`.cursor/plans/archive/production_log_findings_2026-05-14.plan.md`](../../.cursor/plans/archive/production_log_findings_2026-05-14.plan.md) — **cancelled**; план перенесён в archive, `status: completed`.
- [`README.md`](README.md) обновлён под статус «инициатива отменена».
- Ops по плану (кэш, 143, Server Actions): [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md).

## 2026-05-15

- Заведена папка инициативы [`README.md`](README.md).
- Зафиксировано: онлайн реаб/нутри **не** через Rubitime; симптомы в логах — неверный путь автозаписи (исторически).
- Дальнейшие спеки автозаписи **не** велись — заменено решением 2026-06-04.
