# patient-home

Данные для главной пациента.

- `repository.ts` — баннер из проекции рассылок (`mailing_topics_webapp`), логи рассылок.
- `newsMotivation.ts` — новости (`news_items`) и детерминированная «цитата дня» из `motivational_quotes` (стабильный выбор по UTC-дате и seed пользователя). Счётчик `views_count` увеличивается при показе новости залогиненному пациенту.
- Управление новостями и цитатами: `/app/doctor/content/news` (роль doctor/admin).
