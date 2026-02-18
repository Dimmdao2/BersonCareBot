# Пример архитектурных границ

// routes: только HTTP/Telegram вход
// services: бизнес-логика
// repositories: работа с БД
// worker: фоновые задачи
// config: env/infra

// Запретить прямые импорты:
// routes -> repositories
// worker -> routes

// Для усиления границ можно использовать eslint-boundaries или dependency-cruiser.

// TODO: добавить правила ESLint для архитектурных границ
