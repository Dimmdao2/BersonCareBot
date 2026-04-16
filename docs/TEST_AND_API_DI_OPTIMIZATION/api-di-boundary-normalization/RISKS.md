# RISKS — API DI / import-boundary track

1. **Ложная DI-фикация** — оборачивание каждого вызова в фасад без выделения порта увеличивает бойлерплейт без улучшения тестируемости.
2. **Перенос сложности** — логика размазывается между `buildAppDeps` и новыми фабриками; нужна дисциплина «один сценарий — один сервис/use case».
3. **Ломка security semantics** — неверный порядок verify signature, idempotency read, pool tx → повторная обработка webhook или bypass.
4. **Integrator / media / callback поведение** — регрессии в `POST /api/integrator/events`, multipart complete, OAuth redirect цепочках.
5. **Нет enforcement после разовой чистки** — без линтера или CI grep импорты снова «просочатся» в `route.ts`.
6. **Расхождение docs ↔ code** — обновить `api.md`/`di.md` **после** стабилизации кода, иначе документация станет фантазией.
