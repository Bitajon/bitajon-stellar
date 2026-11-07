// Copia los bindings generados por la CLI de Stellar (../bindings/*/src/index.ts)
// a src/contracts/. Correrlo cada vez que Andrés regenere los bindings:
//   npm run sync:bindings
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bindingsDir = resolve(here, "../../bindings");
const outDir = resolve(here, "../src/contracts");
const names = ["nonprofit-registry", "campaign-registry", "campaign-vault", "donation-router"];

for (const name of names) {
  const src = resolve(bindingsDir, name, "src/index.ts");
  if (!existsSync(src)) {
    console.error(`No existe ${src}`);
    process.exitCode = 1;
    continue;
  }
  copyFileSync(src, resolve(outDir, `${name}.ts`));
  console.log(`✔ ${name}`);
}
