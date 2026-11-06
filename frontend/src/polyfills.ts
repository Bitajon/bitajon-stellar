// Debe importarse antes que cualquier módulo del SDK de Stellar.
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer; global?: unknown };
g.Buffer = g.Buffer ?? Buffer;
g.global = g.global ?? globalThis;
