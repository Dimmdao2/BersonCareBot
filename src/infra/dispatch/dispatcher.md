Назначение

Dispatcher выбирает нужную интеграцию для отправки сообщения.

Что делает

Dispatcher получает универсальное сообщение:

intent

и определяет:

какую интеграцию использовать

Пример:

telegram → telegram integration
sms → sms integration
email → email integration

После этого dispatcher передаёт сообщение интеграции.

Что НЕ делает

Dispatcher:
	•	не принимает решений
	•	не знает сценарии
	•	не работает с базой
