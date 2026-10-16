import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // code/vscode is the fetched upstream VS Code source; .claude/ holds agent worktrees.
  { ignores: ['dist/', '**/dist/', 'node_modules/', 'bench-results/', 'bench/fixture/', 'code/vscode/', '.claude/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly', Buffer: 'readonly', URL: 'readonly' } },
  },
  {
    // Playwright scripts run some code inside the app window.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly' } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
