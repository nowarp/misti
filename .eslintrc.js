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
    "import",
    "unused-imports"
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
    // Forbid console.{error,out}
    "no-console": ["error", { "allow": ["warn", "info"] }],
    // Autofix for imports: https://simondosda.github.io/posts/2021-05-10-eslint-imports.html
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }
    ],
    "import/order": [
      "error",
      {
        "groups": [
          ["parent", "sibling", "index"],
          ["builtin", "external"],
        ],
        "newlines-between": "never",
        "pathGroupsExcludedImportTypes": ["builtin"],
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": true
        }
      }
    ]
  },
  // Suppress `no-console` for specific files
  "overrides": [
    {
      "files": ["src/internals/logger.ts", "src/createDetector.ts", "src/main.ts", "test/**", "src/cli/cli.ts"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
};
