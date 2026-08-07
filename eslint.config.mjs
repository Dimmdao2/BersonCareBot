import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const SETTINGS_TABLE_SQL_RE =
  '(from|join|into|update)\\s+("?public"?\\.)?"?(system_settings|app_runtime_settings)"?\\b';
const SETTINGS_TABLE_SQL_MESSAGE =
  'Прямое обращение к public.system_settings / public.app_runtime_settings из integrator запрещено: ' +
  'эти таблицы читаются только под staff-принципалом, а фоновые контуры приложения (bootstrap, infra, ' +
  'операционные роли) прав на них не имеют — запрос падает 42501 и молча уходит в fail-safe. ' +
  'Используй capability из infra/db/publicSystemSettings.ts, а новый ключ добавляй в allow-list ' +
  'соответствующей SECURITY DEFINER функции в оверлее.';
const settingsTableSqlBans = [
  { selector: `TemplateElement[value.raw=/${SETTINGS_TABLE_SQL_RE}/i]`, message: SETTINGS_TABLE_SQL_MESSAGE },
  { selector: `Literal[value=/${SETTINGS_TABLE_SQL_RE}/i]`, message: SETTINGS_TABLE_SQL_MESSAGE },
];

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'runs/**', // временные каталоги прогонов (песочницы Stryker и пр.) — не наш код
      'docs/archive/2026-07-rubitime-retirement/**',
      // Локальные агент-worktree/состояние Claude Code — полные копии репо,
      // не линтуем (иначе вложенный apps/webapp-копия даёт тысячи ложных ошибок).
      '.claude/**',
      '_old/**',
      'admin/dist/**',
      'admin/node_modules/**',
      'apps/webapp/**',
      'apps/integrator/dist/**',
      'apps/media-worker/dist/**',
      // Local/untracked workspace packages (pnpm-workspace lists only apps/* until a package is merged).
      'packages/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['apps/integrator/src/integrations/telegram/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['*db*'] }],
    },
  },

  {
    files: ['apps/integrator/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['*adapters*', '*persistence*', '*channels*', '*integrations*', '*db*'] },
      ],
    },
  },

  {
    files: ['apps/integrator/src/infra/runtime/worker/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['*channels*', '**/app/di*', '**/app/index*'] },
      ],
    },
  },

  // The settings tables are reachable only under a STAFF principal: app_staff holds SELECT on them
  // and EXECUTE on app.current_org_id(), which the RLS policy behind public.system_settings calls.
  // The integrator base login is REVOKEd from both tables outright (deploy/postgres/
  // integrator-server-runtime-config.sql), and none of this app's background contours -- bootstrap,
  // infra, the operational capability roles -- hold either. A direct read from any of them is a
  // hard 42501 at runtime.
  //
  // That is not hypothetical: on 2026-08-07 all seven such readers in this app were broken this
  // way at once, each swallowed by its own fail-safe. A doctor writing to the bot was not
  // recognised as staff, clinics with a connected Google Calendar had the integration silently
  // disabled, clinics that paid for tariff branding kept sending through the platform sender, and
  // operator critical alerts were never dispatched -- all while the journal stayed clean, because
  // nothing exercised those handlers. Nothing in compile, tests or deploy said a word.
  //
  // Reach for a capability in apps/integrator/src/infra/db/publicSystemSettings.ts instead (each
  // is a SECURITY DEFINER function with a fixed key allow-list). Adding a key means adding it to
  // the function's allow-list in the deploy overlay -- which is the point: the grant and the code
  // change together, in review, instead of drifting apart silently.
  //
  // Matches an actual SQL reference (FROM/JOIN/INTO/UPDATE/DELETE FROM), not the mere table name,
  // so mock error strings, audit labels and guard lists stay legal.
  {
    files: ['apps/integrator/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...settingsTableSqlBans,
      ],
    },
  },

  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  prettier,
];
