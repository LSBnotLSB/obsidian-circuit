import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import { builtinModules } from "module";

const prod = process.argv[2] === "production";

// Ensure dist directory exists
if (!fs.existsSync("dist")) {
  fs.mkdirSync("dist", { recursive: true });
}

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: prod ? "dist/main.js" : "main.js",
});

if (prod) {
  await context.rebuild();

  // Copy manifest.json to dist
  fs.copyFileSync("manifest.json", "dist/manifest.json");

  // Copy styles.css to dist if present
  if (fs.existsSync("styles.css")) {
    fs.copyFileSync("styles.css", "dist/styles.css");
  }

  // Synchronize main.js in root for local vault development
  fs.copyFileSync("dist/main.js", "main.js");

  console.log("Production build successfully generated in dist/ (main.js, manifest.json, styles.css)");
  process.exit(0);
} else {
  await context.watch();
}
