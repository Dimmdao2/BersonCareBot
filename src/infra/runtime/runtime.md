Назначение

Runtime выполняет фоновые задачи системы.

Основные задачи

Runtime:
	•	выполняет отложенные задачи
	•	выполняет повторные попытки
	•	запускает задачи по расписанию

Что делает runtime

Runtime получает задачу:

delivery job

и выполняет её.

Типичный цикл:

job
 ↓
domain
 ↓
integration
 ↓
result

Роль runtime

Runtime отвечает только за:

когда выполнить действие

Он не решает:

что делать


будущая структура рантайма:

src/infra/runtime/
    worker/
        main.ts
        jobExecutor.ts
        retryPolicy.ts
    scheduler/
        main.ts
        scheduler.ts