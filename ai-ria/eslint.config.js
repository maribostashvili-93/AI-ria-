import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "examples/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // Deliberate `catch {}` blocks are used throughout to keep optional
      // `.ria/` inputs optional; the unused-var rule should allow the pattern.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-console": "off",
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },
  {
    // Studio ships a browser bundle as a template string; it is not type-checked
    // here and uses DOM globals that the Node config does not know about.
    files: ["src/studio/ui.ts"],
    rules: { "no-useless-escape": "off" },
  },
);
