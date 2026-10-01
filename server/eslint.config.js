// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const SQL_CALL = 'CallExpression[callee.property.name=/^(query|execute)$/]';
const noInterpolatedSql = {
  selector: `${SQL_CALL} > TemplateLiteral[expressions.length>0]`,
  message: 'No interpolated SQL: use `?` placeholders (execute) and bind values.',
};
const noConcatenatedSql = {
  selector: `${SQL_CALL} > BinaryExpression[operator="+"]`,
  message: 'No concatenated SQL: use `?` placeholders (execute) and bind values.',
};
const SECRET_NAME = '/(password|passwd|secret|api_?key|token)/i';
const noHardcodedSecrets = [
  {
    selector: `Property[key.name=${SECRET_NAME}][value.type='Literal'][value.value=/.{6,}/]`,
    message: 'No hardcoded secrets: read them from the environment.',
  },
  {
    selector: `VariableDeclarator[id.name=${SECRET_NAME}][init.type='Literal'][init.value=/.{6,}/]`,
    message: 'No hardcoded secrets: read them from the environment.',
  },
];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.local/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      'no-restricted-syntax': ['error', noInterpolatedSql, noConcatenatedSql, ...noHardcodedSecrets],
    },
  },
  {
    // Fixtures in tests use throwaway values; SQL rules still apply.
    files: ['test/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', noInterpolatedSql, noConcatenatedSql] },
  },
);
