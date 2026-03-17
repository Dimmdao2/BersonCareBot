# kernel

Ядро бота: обработка входящих событий, выбор сценариев и выполнение действий. eventGateway - точка входа. orchestrator - выбор сценария и план шагов. domain - исполнение действий (executor). contentRegistry - загрузка контента. contracts - типы и порты. Сообщения в каналы отдаются как intents и jobs, доставку выполняет dispatcher и адаптеры.
твий. eventGateway — точка входа. orchestrator — выбор сценария и план шагов. domain — исполнение действий (executor). contentRegistry — загрузка контента. contracts — типы и порты.
