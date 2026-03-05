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


будущая струткура рантайма:

src/runtime/
    worker/
        worker.ts
        jobExecutor.ts
        retryPolicy.ts
    scheduler/
        scheduler.ts