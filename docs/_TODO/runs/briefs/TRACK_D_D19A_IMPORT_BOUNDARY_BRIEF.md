# Track D D19a — final import-boundary recensus and structural closure

Authority: `AGENTS.md` §5 and §24;
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D19a:
«после закрытия D18 заново перемерить import allowlist и запретить новый обход. По каждой оставшейся записи
доказать, что это composition-root/public port boundary, либо удалить обход; результат закрепить structural gate,
который ловит direct/alias/dynamic import и re-export, а не новым вечным allowlist. Точный census и команда входят
в evidence D19».

Источник оракула: тот же owner-checkbox D19a — «по каждой оставшейся записи доказать … либо удалить обход» и
«structural gate … ловит direct/alias/dynamic import и re-export».

Текущий exact census до работы:

```bash
rg -n "@/infra/(db|repos)|import\\(['\"]@/infra/(db|repos)" \
  apps/webapp/src/modules apps/webapp/src/app/api \
  -g '!*.test.ts' -g '!*.test.tsx' -g '*.{ts,tsx}'
```

Он показывает только три production allowlist-файла:

- `modules/auth/service.ts`: шесть dynamic imports `pgUserByPhonePort`;
- `modules/integrator/events.ts`: два infra-owned type imports;
- `modules/system-settings/configAdapter.ts`: `pgSystemSettings` и `pgAppRuntimeSettings` construction.

Сделать один coherent pass:

1. Классифицировать каждую запись по фактическому пути. Composition root разрешён только вне domain/module слоя;
   public port type принадлежит модулю, не infra.
2. Удалить настоящие обходы через существующие module ports/DI/composition root. Не создавать второй repo, второй
   service или новый вечный allowlist. Сохранить поведение входа/OTP/dev-bypass, integrator projections и DB-backed
   system settings.
3. Удалить исчерпанные исключения из `apps/webapp/eslint.config.mjs`.
4. Добавить один AST structural gate с self-test, подключённый к обычному lint, который запрещает production
   imports из `@/infra/db/**` и `@/infra/repos/**` в `modules/**` и `app/api/**/route.ts`; он обязан поймать static
   direct, aliased binding, dynamic literal/computed import и re-export, а канонический port/DI consumer пропустить.
   Gate не содержит debt allowlist.
5. Добавить/изменить только поведенческие тесты, необходимые для сохранения перечисленных путей; не писать тесты
   на строки исходника.
6. Evidence содержит exact before/after census commands и классификацию всех трёх исходных файлов.

Проверки: self-test нового gate, обычный root/webapp lint, relevant auth/system-settings/integrator tests, webapp
typecheck и `git diff --check`. Полный CI не запускать. CMS/tariffs/billing, D30 и migrations не трогать;
DEV/TEST/PROD не трогать. Закоммитить продукт и evidence; push не выполнять.
