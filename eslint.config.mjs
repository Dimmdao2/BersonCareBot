import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

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
