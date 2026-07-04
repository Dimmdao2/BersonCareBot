# Доктор (house): прогрессивный план пациента (PHI) — #241

**Задача:** Доктор этап-3: прогрессивный план пациента (PHI)  
**Статус:** Реализовано в brain (commit `168f9a680d0b5ee5ca0cc0918aabb9f9503dbfc4`)  
**Тесты:** 16/16 зелёных (`brain/test/phi-store-patient.test.mjs`)

## Что реализовано

Персона **house** (Доктор) получила набор PHI-команд для прогрессивного ведения плана пациента
в изолированном зашифрованном контуре (`/home/dev/brain-phi/`):

### `patient core` — ядро пациента

Компактная выжимка по пациенту (ФИО, анамнез, жалобы, текущие назначения).
Хранится в `brain-phi/<id>/core.md.gpg`.

```bash
phi-store patient core <client_id> set   # обновить из stdin (md)
phi-store patient core <client_id> get   # вывести ядро
```

### `patient labs` — накопительная таблица анализов

Добавляет анализы строками в таблицу (md, append-only), хранит зашифрованно в `labs.md.gpg`.

```bash
phi-store patient labs add <id> <дата> <показатель> <значение> [норма] [источник]
phi-store patient labs list <id>   # показать таблицу
```

### `patient dynamics` — документ динамики

Собирает labs-таблицу в файл (xlsx/pdf/docx), кладёт в `_out/`, возвращает путь для `@@SEND`.

```bash
phi-store patient dynamics <id>                  # xlsx (умолч.)
phi-store patient dynamics <id> --format pdf
phi-store patient dynamics <id> --format docx
```

### `patient branch` — тематические ветки

Отдельный зашифрованный документ по теме (реабилитация, питание, психология и т.д.).
Хранится в `branch-<key>.md.gpg` — загружается только нужная ветка.

```bash
phi-store patient branch <id> <key> get          # прочитать ветку
phi-store patient branch <id> <key> set          # записать из stdin
```

## Безопасность и изоляция

- Контур доступен **только персоне house** — bwrap прячет `/home/dev/brain-phi/` от прочих персон.
- Проверка `BRAIN_PERSONA=house` — вторая линия защиты.
- Все команды `patient *` закрыты persona_gate: exit 3 для любой не-house персоны.
- PHI **никогда не попадает** в общую KB, git или бэкапы кода.

## Ссылки на реализацию (brain repo)

| Артефакт | Путь |
|----------|------|
| Реализация | `brain/tools/phi-store.sh` (секция `patient)` |
| Тесты (16 шт.) | `brain/test/phi-store-patient.test.mjs` |
| Документация дохтора | `brain/docs/setup/DOCTOR_PATIENT_WORKFLOW.md` |
| Пульт (описание) | `brain/registry/pult.json` |

Commit в brain: `168f9a680d0b5ee5ca0cc0918aabb9f9503dbfc4`
