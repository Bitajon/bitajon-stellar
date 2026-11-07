import { Buffer } from "buffer";
import { bytesToHex } from "./format";

/** SHA-256 de un archivo, calculado en el navegador. El archivo nunca sale del equipo. */
export async function sha256File(file: File): Promise<Buffer> {
  const data = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(new Uint8Array(digest));
}

export function toHex(bytes: Uint8Array | null | undefined): string {
  return bytes ? bytesToHex(bytes) : "";
}
