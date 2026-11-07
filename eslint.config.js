// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    // scripts/*.cjs: công cụ đo chạy bằng Node thuần (CommonJS, cần Playwright cài riêng).
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'scripts/*.cjs'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // Số trong chuỗi ghép (`${n} xu`) là an toàn; vẫn chặn undefined/object.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/client/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/server/**/*.ts', 'packages/shared/**/*.ts', '**/*.config.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // File JS cấu hình ở gốc không thuộc tsconfig nào: tắt các luật cần thông tin kiểu.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
