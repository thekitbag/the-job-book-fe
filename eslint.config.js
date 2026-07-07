import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default tseslint.config(
  {
    // Generated/vendor output; keep in sync with the lint scope in the tech brief.
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'dev-dist',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // React hook + JSX accessibility rules for application code.
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs.flat['recommended-latest'],
      jsxA11y.flatConfigs.recommended,
    ],
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // React Compiler adoption rules from the v7 preset. Every current hit is
      // one of two deliberate codebase patterns: writing a "latest value" ref
      // during render (useSync, useTranscriptPoll, useJobMemory) and
      // load-on-mount effects that set loading state synchronously. Rewriting
      // those would change render/fetch timing, which is out of scope for the
      // lint-enablement PR. Revisit if we adopt the React Compiler.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Deliberate UX: small phone-first modal forms autofocus their first
      // input so the keyboard opens immediately (DirectAddForm, JobPicker,
      // SpendTab, PilotInspectionPage).
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  {
    // Node-context files: configs, scripts, and Playwright specs run under Node.
    files: ['*.{js,ts}', 'scripts/**/*.js', 'e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
)
