/**
 * Live preview: rebuilds on save and serves the film with its soundtrack.
 * Open the printed URL; add ?t=12.5 to start at a time.
 */
import { build, DIST, OUT, watch } from "./lib/build";
import { serve } from "./lib/server";

await build();
const { url } = await serve([DIST, OUT]);
await watch(() => console.log(`rebuilt ${new Date().toLocaleTimeString()}`));
console.log(`Archer film preview: ${url}/index.html`);
