# db

Подключение к базе данных вебаппа и проверка здоровья.

Клиент БД используется репозиториями (pgSymptomDiary, pgLfkDiary, pgChannelPreferences, idempotency и т.д.). Функция проверки здоровья вызывается API health. Миграции лежат в папке migrations в корне webapp.
