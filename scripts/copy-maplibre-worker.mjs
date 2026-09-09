import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const packagePath = createRequire(import.meta.url).resolve("maplibre-gl/package.json");
const { version } = JSON.parse(await readFile(packagePath, "utf8"));
const source = path.join(path.dirname(packagePath), "dist");
const destination = path.join(process.cwd(), "public", "maplibre", version);

await mkdir(destination, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])
{
    await copyFile(path.join(source, file), path.join(destination, file));
}
