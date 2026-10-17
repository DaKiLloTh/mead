import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'storybook-static', 'node_modules', 'wailsjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Component state is @preact/signals, updated by assigning signal.value.
      // This React Compiler rule reads that as mutating a hook's return value.
      'react-hooks/immutability': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'preact',
              importNames: ['createContext'],
              message: 'Shared state lives in module-level signal stores (see src/context/), not Context.',
            },
            ...['preact/hooks', 'preact/compat', 'react'].map((name) => ({
              name,
              importNames: [
                'useState',
                'useReducer',
                'useEffect',
                'useLayoutEffect',
                'useMemo',
                'useCallback',
                'useContext',
              ],
              message:
                'Use @preact/signals: useSignal for state, useComputed for derived values, useSignalEffect for side effects, module-level signal stores for shared state.',
            })),
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: globals.node,
    },
  },
  eslintConfigPrettier
)
