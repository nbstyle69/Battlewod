// Configuration ESLint MINIMALE, volontairement réduite à une seule règle : le
// projet n'a jamais eu d'ESLint, activer un preset noierait le signal sous des
// milliers d'avertissements de style. Objectif : empêcher le stock de lectures
// Supabase qui avalent `error` de repartir à la hausse (cf. src/lib/db.ts).
const tsParser = require('@typescript-eslint/parser');
// Déclarés sans activer une seule de leurs règles : le code existant porte des
// `eslint-disable-next-line @typescript-eslint/... | react-hooks/...` hérités,
// et ESLint échoue sur une directive qui cite une règle inconnue.
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooks = require('eslint-plugin-react-hooks');

const SUPABASE_READ_WITHOUT_ERROR = [
  'VariableDeclarator',
  '[id.type="ObjectPattern"]',
  '[init.type="AwaitExpression"]',
  ':has(CallExpression[callee.object.name="supabase"][callee.property.name=/^(from|rpc)$/])',
  ':has(ObjectPattern > Property[key.name="data"])',
  ':not(:has(ObjectPattern > Property[key.name="error"]))',
].join('');

module.exports = [
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks },
    // Ces règles n'étant pas activées, leurs directives héritées passent pour
    // inutiles : ce bruit masquerait la seule règle qui nous intéresse.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-restricted-syntax': ['warn', {
        selector: SUPABASE_READ_WITHOUT_ERROR,
        message:
          "Lecture Supabase qui ignore `error` : utiliser readRows(query, { screen, action }) de src/lib/db.ts, ou déstructurer `error` explicitement.",
      }],
    },
  },
];
