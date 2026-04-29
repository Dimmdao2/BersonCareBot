# patient-home

Данные для главной пациента.

- `repository.ts` — баннер из проекции рассылок (`mailing_topics_webapp`), логи рассылок.
- `newsMotivation.ts` — новости (`news_items`) и детерминированная «цитата дня» из `motivational_quotes` (стабильный выбор по UTC-дате и seed пользователя). Счётчик `views_count` увеличивается при показе новости залогиненному пациенту.
- `blocks.ts` — коды CMS-блоков и системных зон главной (`PatientHomeBlockCode`), типы целей `PatientHomeBlockItemTargetType`.
- `blockEditorMetadata.ts` — копирайт редактора (лейблы добавления, превью пустых состояний, подписи типов целей).
- `patientHomeUnresolvedRefs.ts` — человекочитаемые причины неразрешённых ссылок для админ-превью.
- Управление новостями и цитатами: `/app/doctor/content` через разделы контента (роль doctor/admin).
- Экран настройки блоков главной (doctor): `/app/doctor/patient-home` (компоненты в `app/settings/patient-home/`).
- Редакторский workflow инициативы (фазы, return URLs): **`patient-home.md`** в этой папке.
