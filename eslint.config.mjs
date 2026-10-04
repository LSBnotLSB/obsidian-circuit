import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "main.js",
      "esbuild.config.mjs",
      "eslint.config.mjs",
    ],
  },
];