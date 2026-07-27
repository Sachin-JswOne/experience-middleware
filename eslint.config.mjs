// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // frontend/ is a separate Vite/React project with its own flat config
    // (browser globals, ESM, react-hooks) — lint it via `npm run lint:fe`.
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'dist-frontend/**',
      'node_modules/**',
      'coverage/**',
      'frontend/**',
    ],
  },

  eslint.configs.recommended,

  ...tseslint.configs.recommended,
  //...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,

  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      'no-console': 'off',
    },
  },
);
