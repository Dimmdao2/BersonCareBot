Назначение

Хранение сценариев и шаблонов сообщений.

Структура

content/
   telegram/
       scripts.json
       templates.json
   rubitime/
       scripts.json
       templates.json

scripts.json

Содержит сценарии.

Пример:

event → действия

templates.json

Содержит шаблоны сообщений.

Пример:

appointment_reminder

Роль слоя:

Content хранит только данные.

Он не содержит код.


Структура хранения

src/content/
  telegram/
    scripts.json
    templates.json
  rubitime/
    scripts.json
    templates.json
  max/
    scripts.json
    templates.json

Правило: каждый канал/интеграция владеет своим контентом (scripts+templates). Общего файла нет.

⸻

Загрузка (registry)

Сделать реестр контента:
	•	ключ: source (telegram | rubitime | max)
	•	значение: { scripts, templates }

Поведение:
	•	на старте приложения загрузить все папки src/content/*/
	•	прочитать scripts.json и templates.json
	•	провалидировать Zod-схемами
	•	сохранить в in-memory cache

⸻

Выбор сценария

Вход: IncomingEvent + Context
	1.	Определить source = event.meta.source (telegram/rubitime/max)
	2.	Взять bundle: registry[source]
	3.	Матчить сценарии только внутри этого source:

	•	enabled
	•	when (type/subtype/text/command/etc)
	•	if (по Context)
	•	priority DESC
	•	взять первый совпавший

⸻

Шаблоны

Шаблоны выбираются из templates.json того же source, что и сценарий:
	•	templateId в step
	•	render: templates[templateId]
	•	поддержка локали внутри шаблона: ru/en/... (если нужно)
	•	интерполяция {{var}}

⸻

Исполнение шагов

Сценарий отдаёт steps[] (actions).
Если step требует текста:
	•	params.templateId
	•	params.vars (или ссылки на поля контекста)
	•	домен/исполнитель вызывает renderTemplate(source, templateId, locale, vars)

⸻

Минимальные контракты для этой схемы
	•	ContentRegistry (Record<Source, ContentBundle>)
	•	ContentBundle ({ scripts: Script[], templates: TemplateMap })
	•	Script, WhenClause, Condition, Step
	•	TemplateMap (Record<string, TemplateEntry>)
	•	TemplateEntry (варианты по locale, плюс optional buttons)
	•	renderTemplate(source, templateId, locale, vars) -> RenderResult