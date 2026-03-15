import { readdir, writeFile } from "node:fs/promises";

const presetsDir = new URL("../presets/", import.meta.url);
const manifestUrl = new URL("index.json", presetsDir);

const files = (await readdir(presetsDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json")
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));

const manifest = {
  files,
};

await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Manifest generado con ${files.length} preset(s): presets/index.json`);
