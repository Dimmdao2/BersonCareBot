# Э4b — действия модалки на mobile

## Изменение

В общем примитиве `DoctorModal` нижняя панель действий теперь на ширинах ниже `sm` — одноколоночная
`grid-cols-1`: каждая кнопка занимает всю ширину и длинная подпись не конкурирует с соседней кнопкой.
На `sm` и шире прежний `sm:flex sm:justify-end` остаётся без изменения: действия находятся в одном
ряду справа. Локальная разметка модалки конфликта не добавлялась, как требует
`DOCTOR_APP_UI_STYLE_GUIDE.md` §14.

## Снимки

| Состояние | Снимок | Статус |
| --- | --- | --- |
| До: desktop, 1440×1024 | [01-before-desktop-1440x1024.png](01-before-desktop-1440x1024.png) | Получен на живом `:5200` 15.09; ряд справа и обе подписи целы. |
| До: mobile, 390×844 | [02-before-mobile-390x844.png](02-before-mobile-390x844.png) | Получен на живом `:5200` 15.09; показывает исходный дефект обрезанной длинной подписи. |
| После: desktop, 1440×1024 | — | **BLOCKED:** кандидат не приземлён в runtime. |
| После: mobile, 390×844 | — | **BLOCKED:** кандидат не приземлён в runtime. |

Исходные снимки скопированы без изменения из
`docs/_TODO/LIVE_ACCEPTANCE_E4B_MODAL_2026-09-15/`; размеры подтверждены командой:

```bash
node -e "const fs=require('node:fs'); for (const f of process.argv.slice(1)) { const b=fs.readFileSync(f); console.log(f+' '+b.readUInt32BE(16)+'x'+b.readUInt32BE(20)); }" docs/_TODO/E4B_MOBILE_ACTIONS_2026-09-15/*.png
# 01-before-desktop-1440x1024.png 1440x1024
# 02-before-mobile-390x844.png 390x844
```

Общий `127.0.0.1:5200` в момент проверки был Turbopack основного дерева
`/home/dev/dev-projects/BersonCareBot` (PID `2254475`), а не этого clone. По §1a worker не запускает
второй Next-сервер, а по §24.3 живая UI-приёмка кандидата возможна только после его landing. Изменять
основное дерево ради снимка запрещено границей задачи. Кроме отсутствующего landing, обязательный
`tools/port-shot.sh` отсутствует во всех клонах `/home/dev/dev-projects`:

```bash
find /home/dev/dev-projects -name port-shot.sh -type f -print
# (пустой вывод)
```

По той же причине не сделаны требуемые mobile-снимки соседних модалок с действиями
`Начать приём` (`PatientEncounterStartModal`) и `Создать наложение`
(`DoctorCalendarEventPanel`): их нельзя честно принять на runtime, не содержащем этот commit.

## Проверки

```bash
pnpm --dir apps/webapp exec tsc --noEmit --pretty false
# exit 0

pnpm --dir apps/webapp exec eslint src/shared/ui/doctor/DoctorModal.tsx
# exit 0

git diff --check
# exit 0
```

Автоматические UI-тесты не создавались и не запускались: для геометрии модалки оракул — live-снимок,
а §10a запрещает автоматизированные UI-тесты.

## НЕ СДЕЛАНО

- Пост-правочные desktop/mobile-снимки модалки конфликта и два mobile-снимка соседних модалок — ждут
  landing кандидата ведущим на единственный общий `:5200`.
- Полный CI не запускался по прямому запрету брифа.
- Миграции, DEV/TEST/PROD, права и текст кнопок не изменялись.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Ведущему требуется после landing снять четыре обязательных live-снимка и добавить строку вердикта
в `feat`; автор кандидата её не подписывает.
