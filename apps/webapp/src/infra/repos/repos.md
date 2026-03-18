# repos

Реализации портов хранилищ (репозитории).

Каждый файл реализует один или несколько портов из модулей: symptomDiary (in-memory и pg), lfkDiary (in-memory и pg), channelPreferences (in-memory и pg), mockMediaStorage, при необходимости idempotency store. Модули получают эти реализации через app-layer/di в зависимости от наличия DATABASE_URL.
