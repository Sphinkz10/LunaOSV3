const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;
const antiHardcode = {
  meta: { type: 'problem', messages: {
    hex: 'Cor hex proibida fora de @luna/tokens — usa tokens semânticos (var(--…)).',
    important: '!important proibido (orçamento = 0). Resolve por tokens/cascata.',
  }},
  create(ctx) {
    const file = ctx.filename || '';
    if (file.includes('packages/tokens/')) return {};
    const check = (node, raw) => {
      if (typeof raw !== 'string') return;
      if (HEX.test(raw)) ctx.report({ node, messageId: 'hex' });
      if (raw.includes('!important')) ctx.report({ node, messageId: 'important' });
    };
    return {
      Literal(n) { check(n, n.value); },
      TemplateElement(n) { check(n, n.value && n.value.raw); },
    };
  },
};

module.exports = [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/__tests__/**'] },
  {
    files: ['**/*.{ts,tsx,js,jsx,cjs}'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { luna: { rules: { 'no-hardcoded-visuals': antiHardcode } } },
    rules: { 'luna/no-hardcoded-visuals': 'error' },
  },
  // Regras de hooks e de acessibilidade (auditoria, Baixo)
  {
    files: ['**/*.{tsx,jsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
];
