module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'coverage', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react-refresh'],
  rules: {
    // AppProvider and its useAppState hook are a single context module; that's
    // the conventional pattern and not worth splitting to satisfy fast refresh.
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true, allowExportNames: ['useAppState'] },
    ],

    // The exhaustive-deps rule is what would have caught the playback loop
    // tearing itself down every frame. Keep it an error, not a warning.
    'react-hooks/exhaustive-deps': 'error',

    // `_`-prefixed args are intentionally unused.
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
