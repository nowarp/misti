module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    "project": true
  },
  extends: [
    "plugin:@typescript-eslint/recommended",
  ],
  ignorePatterns: ["src/detectors/templates"],
  plugins: [
    "@typescript-eslint",
  ],
  rules: {
    "@typescript-eslint/switch-exhaustiveness-check": "error",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
};
