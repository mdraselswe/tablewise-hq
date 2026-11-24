import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist/**", "**/coverage/**", "**/node_modules/**"]),

  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },

  // ---- API: module boundaries and configuration discipline ----
  {
    files: ["apps/api/src/**/*.ts"],
    rules: {
      // Read environment variables only through src/config/env.ts (validated at startup).
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: "Use loadEnv() from @/config/env.ts." },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*", "@/modules/*/*", "../*"],
              message:
                "A module must not import another module. Declare a port in your service and let src/container.ts wire it.",
            },
            {
              group: ["@/app.ts", "@/container.ts", "@/main.ts"],
              message: "Modules must not depend on the composition root.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/platform/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/modules/*"], message: "Platform code is business-agnostic: never import a module." },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/config/env.ts", "apps/api/src/cli/**/*.ts", "apps/api/test/**/*.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // ---- Web: React rules ----
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
]);
