/**
 * Render the landing page's link preview to a PNG, to eyeball it without a
 * build: `pnpm render:og [out.png]` (default: og.png in the current directory).
 */
import { writeFile } from "node:fs/promises";
import * as mod from "../app/welcome/opengraph-image";

type Render = () => Promise<Response>;
// The route module loads as CommonJS under tsx, which nests the default export.
const render: Render =
  (mod as unknown as { default: Render | { default: Render } }).default instanceof Function
    ? (mod.default as Render)
    : (mod.default as unknown as { default: Render }).default;

const out = process.argv[2] ?? "og.png";
const res = await render();
await writeFile(out, Buffer.from(await res.arrayBuffer()));
console.log(`wrote ${out}`);
