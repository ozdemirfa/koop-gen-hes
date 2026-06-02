import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Sprint 20260511-open-backlog-sprint (CODE-006):
      // Surface untyped `any` usages as warnings (not errors). Build pipeline
      // does not fail on warnings — gradually migrate to typed payloads.
      '@typescript-eslint/no-explicit-any': 'warn',

      // QUAL-3 (kalite-guvenlik-2026-06): aşağıdaki iki kural DX/advisory —
      // runtime/üretim bug'ı DEĞİL; CI lint gate'ini error ile bloklamamalı,
      // warn olarak izlenir:
      //  - react-refresh/only-export-components: yalnız HMR/fast-refresh DX'ini
      //    etkiler. Context dosyaları Provider + hook + tip birlikte export eder;
      //    ayırmak büyük import churn'ü yaratır, üretim etkisi sıfırdır.
      //  - react-hooks/preserve-manual-memoization: react-compiler manuel
      //    useMemo/useCallback'i koruyamadığında advisory uyarır; davranış doğru.
      'react-refresh/only-export-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
])
