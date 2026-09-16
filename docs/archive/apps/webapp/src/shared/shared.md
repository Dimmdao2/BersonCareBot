# shared

Общие сущности, используемые в разных частях вебаппа.

- **ui/** — product UI: `ui/patient/**` (PatientAppShell, auth, primitives) и `ui/doctor/**` (DoctorAppShell, catalog, primitives). CSS: `app/styles/patient.css` / `doctor.css`.
- **types/** — общие типы (сессия, пользователь и т.д.).
- **utils/** — вспомогательные функции.

Не содержат бизнес-логики домена; только представление и типы.
