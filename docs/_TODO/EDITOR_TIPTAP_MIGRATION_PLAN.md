> STATUS (verified 2026-07-23, code-reconciled): see docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md

# План: замена markdown-редакторов на Tiptap WYSIWYG (вариант 1)

> Заведён 2026-07-21. Решение владельца: «поменять редактор ВЕЗДЕ, где стоит markdown».
> Способ — **вариант 1**: меняем только WYSIWYG-начинку, **формат хранения остаётся markdown (GFM)**.
> Канон решения по инструменту: [`docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`](../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md)
> (раздел «Редактор контента» → «Замена существующих markdown-редакторов»). taskdb: `bcb` **#931**.
>
> **Статус документа:** подчинённый execution-checklist taskdb #931, не параллельный product/SaaS roadmap.
> Оперативный статус хранится в taskdb; порядок запуска задаёт основной roadmap/оркестратор. «Тесты/аудит зелёные»
> сами по себе ≠ готово: нужны галочки ниже, milestone CI и живая проверка всех пунктов discovery-manifest.
>
> **Статус 21.07 — repository stage интегрирован и milestone-гейт зелёный; ждёт живой TEST-приёмки.** Discovery,
> перевод компонентов, один независимый аудит и его plan-mapped correction выполнены; формат хранения остался
> markdown. Интеграционные коммиты: `74bc30670`, `c3dc92127`, `998f0d67b`; общий milestone gate зелёный на
> `c6a8930c2`. До полного «готово» остаётся живая проверка владельцем всех доступных строк manifest на TEST. Этот
> файл сам по себе не является триггером deploy.
>
> **Подтверждение памяти владельца (21.07):** «где-то самописный простой редактор, где-то готовый модуль, он не
> нравится» — по факту так и есть: самописный = кастомный `MarkdownEditor` (textarea + тулбар) на `/broadcasts`;
> готовый модуль = **Toast UI** (`MarkdownEditorToastUi`) на `/content` и `/recommendations`. Оба уходят под единый Tiptap.
>
> **Граница с N1B (#930) — уточнение владельца 21.07 (Tiptap ТУДА НЕ идёт):** транзакционные шаблоны — тексты
> уведомлений, напоминания о записи, OTP-коды в email — **из скоупа Tiptap ИСКЛЮЧЕНЫ**. Там контент остаётся в
> текущем простом редакторе «Тексты уведомлений» (`/app/doctor/schedule`), а визуально настраивается только
> отдельный server-owned **email-safe конверт письма** с ограниченными полями бренда — это часть N1B, **не Tiptap**;
> пользовательский HTML/CSS там не принимается.
> Канон конверта: [`TOOLING_AND_PACKAGES_DECISIONS.md`](../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md)
> §«Конверт транзакционных писем». `#931` и N1B-конверт — независимы и не пересекаются.

## Факт (что есть сейчас)

- **Известные экраны с markdown-редактором (3), на 2 общих компонентах:**
  - `/app/doctor/content` — статьи CMS → `MarkdownEditorToastUi` (Toast UI WYSIWYG).
  - `/app/doctor/recommendations` — рекомендации → `MarkdownEditorToastUi`.
  - `/app/doctor/broadcasts` — рассылки → `MarkdownEditor` (кастомный textarea + тулбар + превью).
  - **Владелец: «Tiptap ВЕЗДЕ, где markdown».** Значит первым делом — **discovery-sweep** (grep обоих компонентов +
    прочие markdown-textarea) и заменить ВСЕ найденные, а не только эти 3. Транзакционные шаблоны уведомлений/OTP —
    **исключены** (см. границу с N1B выше).
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

Один компонент Tiptap-WYSIWYG (имя сохранить `MarkdownEditor`, чтобы был единый чокпоинт), на него — все пункты
discovery-manifest; Toast UI полностью выведен.

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

## Discovery-manifest (зафиксирован перед реализацией, подтверждён после sweep)

Sweep выполнен по двум прежним компонентам редактора, `bodyMd`/`body_md`, DB/type-полям с документированной
markdown-семантикой и точечному просмотру textarea-потребителей. Простые заметки, комментарии, описания без
markdown-семантики и N1B-шаблоны уведомлений не включались.

| Живая поверхность | Write-path | Хранение/контракт | Реализация #931 |
|---|---|---|---|
| `/app/doctor/content` | `ContentForm` | `body_md`, Markdown/GFM | единый `MarkdownEditor` |
| `/app/doctor/recommendations` | `RecommendationForm` | `bodyMd`, Markdown/GFM | единый `MarkdownEditor` |
| `/app/doctor/broadcasts` | `BroadcastForm` | `message.body`, Markdown | единый `MarkdownEditor` |
| `/app/doctor/treatment-program-templates/[id]` | создание/редактирование целей и задач этапа | `goals`/`objectives`, TEXT с markdown-семантикой | единый `MarkdownEditor` |
| `/app/doctor/clients/[userId]/treatment-programs/[instanceId]` | цели и задачи этапа назначенной программы | `goals`/`objectives`, TEXT с markdown-семантикой | единый `MarkdownEditor` |
| тот же экран назначенной программы, диалог добавления | собственная рекомендация | `bodyMd`, Markdown/GFM | единый `MarkdownEditor` |

Результат контрольного поиска: активных импортов `MarkdownEditorToastUi` и зависимостей `@toast-ui/*` не осталось;
других doctor-facing write-полей, документированных в schema/domain как Markdown, не найдено. Пациентские
`MarkdownContent`/render-tree не менялись. Тексты N1B (`NotificationTemplatesPageClient`) намеренно остались простыми.

## Чек-лист

### Этап 1 — компонент
- [x] До реализации сохранить discovery-manifest всех markdown write-surfaces и их общих компонентов; список не
      ограничивается тремя уже известными экранами.
- [x] Добавить Tiptap deps (см. выше), зафиксировать в `apps/webapp/package.json` + lockfile.
- [x] Новый Tiptap-`MarkdownEditor` с тем же публичным контрактом (`value/onChange/defaultValue/name/maxLength/label`).
- [x] markdown→doc→markdown roundtrip стабилен на репрезентативном контенте (заголовки, списки, ссылки, картинки,
      **media-ссылки `/api/media/…`, YouTube, Rutube**, таблицы/зачёркнутый если используются).
- [x] `MediaLibraryInsertDialog` подключён через Tiptap-команду (link/image), выдаёт тот же URL, что и раньше.
- [x] `maxLength` по markdown соблюдается; скрытый `input[name]` содержит актуальный markdown при сабмите.

### Этап 2 — перевод форм и вывод Toast UI
- [x] `content`, `recommendations`, `broadcasts` и каждый дополнительный пункт discovery-manifest импортируют новый
      компонент; поведение форм не изменилось.
- [x] Удалить `MarkdownEditorToastUi`, `MarkdownEditorToastUiInner` и зависимости `@toast-ui/*` из package.json.
- [x] Старые тесты редактора обновлены/заменены; тесты рендера и `MediaLibraryInsertDialog` остаются зелёными.

### Этап 3 — проверки
- [x] Точечные тесты: roundtrip, сабмит формы, maxLength, вставка медиа. Затем **один раз** full CI (lint+typecheck+tests).
- [x] **Регрессия рендера:** сохранённый ранее markdown по-прежнему корректно рендерится у пациента (формат не менялся).
- [x] Независимый аудит compatibility/data-risk (ОДИН проход): проверить отсутствие потери контента при
      roundtrip, сохранность media-ссылок, соблюдение правил репо (client-only, no server import, изоляция), отсутствие
      скрытой смены формата хранения. Находки, которых нет в этом плане, → ВОПРОС владельцу, не новый скоуп.
- [ ] **Живая проверка каждого экрана из discovery-manifest** (`port.sh shot` / dev `:5200`) владельцу — приёмка.
      До неё статус = «этапы закрыты, ждёт приёмки». (owner-gated: live owner acceptance per discovery-screen); all engineering done.

Текущее evidence: исходный golden roundtrip/контракт — `5/5`, затронутые формы, media dialog и doctor/patient
render — `66/66`. Один независимый audit pass нашёл две plan-mapped compatibility-дельты: legacy `body_html` мог
попасть в markdown editor, а over-limit legacy document нельзя было постепенно сократить. Correction `998f0d67b`
закрыл обе; его targeted no-DB suite — `33/33`, scoped lint/typecheck — PASS. По presentation-risk policy второй
серийный audit round не открывался. Общий milestone gate на `c6a8930c2` прошёл lint/typecheck, integrator/webapp/media
tests, оба builds и все audits. Live-check остаётся отдельной последней галочкой.

## Готово =
Все галочки выше + зелёный milestone CI + owner acceptance по живой проверке всех пунктов discovery-manifest.
«Аудит зелёный» сам по себе — гейт, не «готово».
