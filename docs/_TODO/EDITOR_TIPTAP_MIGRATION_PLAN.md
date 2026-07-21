# План: замена markdown-редакторов на Tiptap WYSIWYG (вариант 1)

> Заведён 2026-07-21. Решение владельца: «поменять редактор ВЕЗДЕ, где стоит markdown».
> Способ — **вариант 1**: меняем только WYSIWYG-начинку, **формат хранения остаётся markdown (GFM)**.
> Канон решения по инструменту: [`docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`](../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md)
> (раздел «Редактор контента» → «Замена существующих markdown-редакторов»). taskdb: `bcb` **#931**.
>
> **Правило приёмки (канон владельца):** этот план-файл — единственный источник «todo» и «done». «Тесты/аудит
> зелёные» сами по себе ≠ готово. Готово = галочки ниже + зелёный full CI + **живой скрин 3 экранов** владельцу.
>
> **Статус — PLAN-ONLY, исполнение НЕ запущено.** Планирование ведёт верхняя персона; **когда безопасно выполнять —
> решает основной оркестратор** (через taskdb `auto_ok`/`doing` под конкретный manifest). Этот файл — не триггер
> исполнения. Порядок исполнения (воркер + один независимый аудит + приёмка) описан ниже как требование к тому, кто
> будет выполнять, а не как «делаю сейчас».
>
> **Подтверждение памяти владельца (21.07):** «где-то самописный простой редактор, где-то готовый модуль, он не
> нравится» — по факту так и есть: самописный = кастомный `MarkdownEditor` (textarea + тулбар) на `/broadcasts`;
> готовый модуль = **Toast UI** (`MarkdownEditorToastUi`) на `/content` и `/recommendations`. Оба уходят под единый Tiptap.
>
> **Связь с N1B (#930):** этот же Tiptap-компонent — WYSIWYG-начинка для правки **HTML-тела писем** в редакторе
> шаблонов уведомлений (место в админке: `/app/doctor/schedule` → «Тексты уведомлений»; сейчас это простой текстовый
> шаблонизатор, HTML-письма добавляет N1B). `#931` — кросс-каттинг enabler, приземляется независимо; N1B его переиспользует.

## Факт (что есть сейчас)

- **3 экрана доктора с markdown-редактором:**
  - `/app/doctor/content` — статьи CMS → `MarkdownEditorToastUi` (Toast UI WYSIWYG).
  - `/app/doctor/recommendations` — рекомендации → `MarkdownEditorToastUi`.
  - `/app/doctor/broadcasts` — рассылки → `MarkdownEditor` (кастомный textarea + тулбар + превью).
- **Общий контракт обоих компонентов:** `value?: string` (markdown), `onChange?(md)`, `defaultValue`, скрытый
  `name` для сабмита формы, `maxLength` (по умолчанию 50_000, считается по markdown-строке).
- **Хранение = markdown-текст** в БД. **Рендер у пациента и в превью** — `react-markdown` + `remark-gfm` +
  `rehype-sanitize` (`shared/ui/{doctor,patient}/markdown/markdownRenderTree.tsx`, `MarkdownContent.tsx`).
- **«Диплинки видео» — это ОБЫЧНЫЕ markdown-ссылки** `[текст](url)`; вся логика встраивания плеера — в рендер-
  `components` (`MarkdownEmbeddedLink.tsx`), распознаёт href на `/api/media/{uuid}`, YouTube, Rutube. **Кастомного
  markdown-синтаксиса НЕТ** → markdown стандартный GFM → roundtrip Tiptap↔markdown безопасен.
- **Вставка из медиатеки:** `MediaLibraryInsertDialog` → `markdownSnippetForMediaUrl()` вставляет markdown-сниппет
  ссылки/картинки. Это единственная «умная» вставка, её надо перенести на Tiptap-команду (link/image с тем же URL).

## Границы (жёстко)

- **НЕ трогаем формат хранения** — на выходе редактора та же markdown-строка. **Миграции БД НЕТ.**
- **НЕ трогаем пациентский рендер** (`shared/ui/patient/markdown/*`) и рендер-`components` (видео/медиа-плеер).
- **НЕ трогаем 3 формы по существу** — только импорт компонента (контракт `value/onChange/name` сохраняется).
- Прод не трогаем; проверка на dev/тесте. Ветка — текущая feature, без push/merge/deploy.

## Целевой дизайн

Один компонент Tiptap-WYSIWYG (имя сохранить `MarkdownEditor`, чтобы был единый чокпоинт), на него — все 3 формы;
Toast UI полностью выведен.

- **Deps добавить:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`,
  `@tiptap/extension-image` + markdown-мост (`tiptap-markdown` или собственный сериализатор на `prosemirror-markdown`).
  Для паритета с `remark-gfm` — таблицы/зачёркнутый/таск-листы, если реально используются в контенте (проверить по
  данным; не тащить лишнего).
- **markdown in:** парсить входной `value` (markdown) в Tiptap-документ на маунте и при внешней смене `value`.
- **markdown out:** на каждое изменение сериализовать документ обратно в markdown → `onChange(md)` + запись в
  скрытый `input[name]` (для не-controlled форм). `maxLength` считать по сериализованному markdown.
- **Тулбар (сохранить как минимум):** жирный, курсив, заголовки, списки (маркир./нумер.), inline-код, ссылка,
  вставка из медиатеки (`MediaLibraryInsertDialog` → Tiptap link/image command). Стиль — наша Design DNA (primitives),
  не дефолтная тема Tiptap; **Simple Editor** как база (НЕ AI-editor — платный Tiptap Cloud, наружу; см. канон).
- **SSR:** Tiptap — client-only (`"use client"`), у форм уже client-компоненты; не импортировать в серверных.

## Чек-лист

### Этап 1 — компонент
- [ ] Добавить Tiptap deps (см. выше), зафиксировать в `apps/webapp/package.json` + lockfile.
- [ ] Новый Tiptap-`MarkdownEditor` с тем же публичным контрактом (`value/onChange/defaultValue/name/maxLength/label`).
- [ ] markdown→doc→markdown roundtrip стабилен на репрезентативном контенте (заголовки, списки, ссылки, картинки,
      **media-ссылки `/api/media/…`, YouTube, Rutube**, таблицы/зачёркнутый если используются).
- [ ] `MediaLibraryInsertDialog` подключён через Tiptap-команду (link/image), выдаёт тот же URL, что и раньше.
- [ ] `maxLength` по markdown соблюдается; скрытый `input[name]` содержит актуальный markdown при сабмите.

### Этап 2 — перевод форм и вывод Toast UI
- [ ] `content`, `recommendations`, `broadcasts` импортируют новый компонент; поведение форм не изменилось.
- [ ] Удалить `MarkdownEditorToastUi`, `MarkdownEditorToastUiInner` и зависимости `@toast-ui/*` из package.json.
- [ ] Старые тесты редактора обновлены/заменены; тесты рендера и `MediaLibraryInsertDialog` остаются зелёными.

### Этап 3 — проверки
- [ ] Точечные тесты: roundtrip, сабмит формы, maxLength, вставка медиа. Затем **один раз** full CI (lint+typecheck+tests).
- [ ] **Регрессия рендера:** сохранённый ранее markdown по-прежнему корректно рендерится у пациента (формат не менялся).
- [ ] Независимый адверсарный аудит (presentation-tier, ОДИН проход): проверить отсутствие потери контента при
      roundtrip, сохранность media-ссылок, соблюдение правил репо (client-only, no server import, изоляция), отсутствие
      скрытой смены формата хранения. Находки, которых нет в этом плане, → ВОПРОС владельцу, не новый скоуп.
- [ ] **Живой скрин 3 экранов** (`port.sh shot` / dev `:5200`) владельцу — приёмка. До неё статус = «этапы закрыты, ждёт приёмки».

## Готово =
Все галочки выше + зелёный full CI + owner acceptance по живым скринам 3 экранов. «Аудит зелёный» сам по себе — гейт, не «готово».
