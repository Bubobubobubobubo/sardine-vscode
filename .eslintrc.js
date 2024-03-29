module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: [],
  ignorePatterns: [],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "tsconfig.json",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/class-name-casing": "warn",
    "@typescript-eslint/member-delimiter-style": [
      "warn",
      {
        multiline: {
          delimiter: "semi",
          requireLast: true,
        },
        singleline: {
          delimiter: "semi",
          requireLast: false,
        },
      },
    ],
    "@typescript-eslint/semi": ["warn", "always"],
    eqeqeq: ["warn", "always"],
    "no-redeclare": "warn",
    "no-throw-literal": "warn",
  },
  settings: {},
};
