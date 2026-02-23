import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import noSecrets from "eslint-plugin-no-secrets";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "_old/**",
    ],
  },

  js.configs.recommended,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "no-secrets": noSecrets,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-secrets/no-secrets": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
  },

  {
    files: ["src/channels/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["*db*"] }],
    },
  },

  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["*adapters*", "*persistence*", "*channels*", "*db*"] }],
    },
  },

  {
    files: ["src/worker/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["*channels*", "*app*"] }],
    },
  },

  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  prettier,
];
