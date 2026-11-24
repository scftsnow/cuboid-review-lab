import tseslint from 'typescript-eslint';

const generatedDirectories = [
  'node_modules/**',
  'dist/**',
  'coverage/**',
  'test-results/**',
  'playwright-report/**',
  '.vite/**',
  'build/**',
  'out/**',
];

export default tseslint.config(
  { ignores: generatedDirectories },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
);
