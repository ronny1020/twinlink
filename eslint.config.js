import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierPlugin from 'eslint-plugin-prettier'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "TSAsExpression[typeAnnotation.type='TSUnknownKeyword'] > TSAsExpression, TSAsExpression[typeAnnotation.type='TSAnyKeyword'] > TSAsExpression",
          message:
            "Do not use 'as unknown as' or 'as any as' for type casting. Use a more specific type or '@ts-expect-error' if you are intentionally bypassing the type system.",
        },
      ],
    },
  },
  {
    ignores: ['dist/', 'demo/dist/'],
  },
)
