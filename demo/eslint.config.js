import tseslint from 'typescript-eslint'
import tailwindPlugin from 'eslint-plugin-better-tailwindcss'
import rootConfig from '../eslint.config.js'

export default tseslint.config([
  ...rootConfig,
  tailwindPlugin.configs.recommended,
  {
    rules: {
      'better-tailwindcss/enforce-consistent-line-wrapping': [
        'error',
        {
          preferSingleLine: true,
          printWidth: 999,
          classesPerLine: 999,
        },
      ],
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
])
