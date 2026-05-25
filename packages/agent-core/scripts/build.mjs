import { mkdir, readdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

await rm(distDir, { recursive: true, force: true });

async function buildDir(currentSrcDir, currentDistDir) {
  await mkdir(currentDistDir, { recursive: true });

  for (const entry of await readdir(currentSrcDir, { withFileTypes: true })) {
    const srcPath = path.join(currentSrcDir, entry.name);
    const distPath = path.join(currentDistDir, entry.name);

    if (entry.isDirectory()) {
      await buildDir(srcPath, distPath);
      continue;
    }

    if (entry.name.endsWith(".ts")) {
      const source = await readFile(srcPath, "utf8");
      const transformed = stripTypeScriptTypes(source, {
        mode: "transform",
        sourceUrl: srcPath,
      });
      await writeFile(distPath.replace(/\.ts$/, ".js"), transformed);
      continue;
    }

    if (entry.name.endsWith(".json")) {
      await copyFile(srcPath, distPath);
    }
  }
}

await buildDir(srcDir, distDir);
