import { defineConfig } from 'eslint-define-config'
import { BaseConfig } from './base'

export default defineConfig({
  ...BaseConfig,
  extends: [...(BaseConfig.extends || []), 'plugin:vue/vue3-essential', 'plugin:vue/vue3-recommended'],
  overrides: [
    {
      files: ['*.vue'],
      parser: 'vue-eslint-parser',
      parserOptions: {
        ecmaVersion: 'latest',
        parser: '@typescript-eslint/parser',
        sourceType: 'module',
      },
      rules: {
        'no-unused-vars': 'off',
        'no-undef': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'vue/multi-word-component-names': 'off',
        'vue/max-attributes-per-line': 'off',
      },
    },
  ],
  plugins: ['vue', '@typescript-eslint', 'import'],
  rules: {
    ...BaseConfig.rules,
    'vue/max-attributes-per-line': [
      'error',
      {
        singleline: {
          max: 3,
        },
        multiline: {
          max: 1,
        },
      },
    ],
    'vue/no-mutating-props': 0,
    '@typescript-eslint/no-explicit-any': ['off'],
    // "vue/require-default-prop": ["error"]
  },
})
