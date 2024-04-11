module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    "project": true
  },
  extends: [
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: [
    "@typescript-eslint",
    "jsdoc"
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
  settings: {
    jsdoc: {
      mode: "typescript",
    }
  }
};
