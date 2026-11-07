// BITAJÓN · Edge Function "bitajon"
// Única puerta de escritura a Supabase. Cada petición trae un mensaje firmado con la wallet
// Stellar (Varial/Freighter signMessage) y la autoridad se comprueba contra los contratos:
//  - imágenes / evidencia de una campaña: solo la fundación dueña (campaign.nonprofit on-chain)
//    (o el admin del despliegue)
//  - perfil / logo de una fundación: esa misma dirección o el admin; RUT: solo la fundación
//  - ver el RUT: solo el admin configurado para ese registro
//  - "sync-events" (público): copia en bitajon_events los eventos leídos de la red
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Networks, StrKey, contract, rpc, scValToNative } from "npm:@stellar/stellar-sdk@17";

const RPC_URL = "https://soroban-testnet.stellar.org";
// Despliegues permitidos (IDs públicos). admin = única cuenta que puede ver RUTs.
const CONFIGS = [
  { name: "oficial", nonprofit: "CA5LHUGEJ4S6XJV5ZBCOOKIWAARGA7QSZERAAUM2NVWCXHDPRRSFT55K", campaigns: "CCZPWOKGTLT2UWLZEGYC55BPLR4GLZOUGCBVDXEEFSLE5QPVPMMU7EZR", vault: "CARMUNTRKKX6KA7ZXVMYVZVAZ5DLZF5B53V5K6J5OE3CMFYGB7FWCCTT", router: "CAZ5WAOUTXF5E6OWZ6AAIPQVUXLAJKNUTC3RG266Q47WR2LD2WJSRLSD", admin: "GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5" },
  { name: "demo", nonprofit: "CCVKZINNVI3KT4NVDTLSGARRSA6VUS5LMOPVLC2LVIPJGTKZ5JTZSM4M", campaigns: "CBLOWODTDTCW3QEXRILELV7HFSV7AMTRRF4QC5WOYVRSZXWYE57IX4FF", vault: "CCG5H4OD35N5U2OUPSBO2USRGMWKCZ54WHDNIDEL3RPRTLRLAXICAFIQ", router: "CCWULVXPIT2NOY7QLBTXJVQORNKKPAUTZ5AGWEYEG6A24N6R36VHDC4I", admin: "GAK5R3LUSKVWX3L4X4HR3XI5QT4SOWBOEAO3NQUHK7CH4GULLVQCUS4U" },
];
const AUTH_TTL_MS = 30 * 60 * 1000;
const BUCKET = { media: "bitajon-media", evidence: "bitajon-evidence", rut: "bitajon-rut" } as const;
const MIME: Record<string, string[]> = {
  media: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  logo: ["image/jpeg", "image/png", "image/webp"],
  evidence: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  rut: ["application/pdf", "image/jpeg", "image/png"],
};
const MAX: Record<string, number> = { media: 5_242_880, logo: 2_097_152, evidence: 10_485_760, rut: 5_242_880 };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const enc = new TextEncoder();
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256Hex(data: Uint8Array | string) {
  return hex(await sha256(typeof data === "string" ? enc.encode(data) : data));
}

function sigBytes(s: string): Uint8Array {
  const t = s.trim();
  if (/^[0-9a-fA-F]{128}$/.test(t)) return Uint8Array.from(t.match(/../g)!.map((h) => parseInt(h, 16)));
  // Decodificador base64 propio (estándar o URL-safe), sin depender de atob.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = t.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error("base64 inválido");
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

async function edVerify(pub: Uint8Array, sig: Uint8Array, data: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, sig, data);
}

/** Verifica el mensaje firmado. Acepta SEP-53 (sha256("Stellar Signed Message:\n" + msg)) y firma directa. */
async function verifyAuth(auth: { address?: string; message?: string; signature?: string }): Promise<string> {
  const { address, message, signature } = auth ?? {};
  if (!address || !message || !signature || !StrKey.isValidEd25519PublicKey(address)) throw new HttpError(401, "Firma incompleta");
  const lines = Object.fromEntries(message.split("\n").slice(1).map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1)]));
  if (!message.startsWith("BITAJON auth") || lines.address !== address) throw new HttpError(401, "Mensaje inválido");
  const issued = Date.parse(lines.issued ?? "");
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > AUTH_TTL_MS) throw new HttpError(401, "La firma venció. Vuelve a firmar.");
  const pub = new Uint8Array(StrKey.decodeEd25519PublicKey(address));
  let sig: Uint8Array;
  try {
    sig = sigBytes(signature);
  } catch (e) {
    throw new HttpError(401, `Firma ilegible (${signature.length} caracteres: ${e instanceof Error ? e.message : e})`);
  }
  const raw = enc.encode(message);
  const prefix = enc.encode("Stellar Signed Message:\n");
  const joined = new Uint8Array(prefix.length + raw.length);
  joined.set(prefix);
  joined.set(raw, prefix.length);
  const ok = (await edVerify(pub, sig, await sha256(joined)).catch(() => false)) || (await edVerify(pub, sig, raw).catch(() => false));
  if (!ok) throw new HttpError(401, "Firma inválida");
  return address;
}

const campaignClients = new Map<string, Promise<any>>();
async function campaignOwner(registry: string, id: number): Promise<string> {
  if (!campaignClients.has(registry))
    campaignClients.set(registry, contract.Client.from({ contractId: registry, networkPassphrase: Networks.TESTNET, rpcUrl: RPC_URL }));
  const c = await campaignClients.get(registry)!;
  const tx = await c.get_campaign({ campaign_id: BigInt(id) });
  if (tx.simulation?.error) throw new HttpError(404, "La campaña no existe on-chain");
  return String(tx.result.nonprofit);
}

function configFor(kind: "nonprofit" | "campaigns", registry: string) {
  const cfg = CONFIGS.find((c) => c[kind] === registry);
  if (!cfg) throw new HttpError(400, "Registro no permitido");
  return cfg;
}

const safeName = (n: string) => (n || "archivo").normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };

async function requireOwner(signer: string, registry: string, campaignId: number) {
  const cfg = configFor("campaigns", registry);
  if (!Number.isSafeInteger(campaignId) || campaignId < 1) throw new HttpError(400, "Campaña inválida");
  const owner = await campaignOwner(registry, campaignId);
  if (signer === cfg.admin) return; // el admin puede gestionar las fotos de cualquier campaña
  if (owner !== signer) throw new HttpError(403, "Solo la fundación dueña de la campaña puede hacer esto");
}

function assertPaths(paths: unknown[], prefix: string) {
  for (const p of paths)
    if (typeof p !== "string" || !p.startsWith(prefix) || p.includes("..")) throw new HttpError(400, "Ruta de archivo inválida");
}

/** Una fundación edita su propio perfil; el admin puede editar el de cualquiera. */
function targetNonprofit(signer: string, cfg: { admin: string }, requested: unknown): string {
  const t = typeof requested === "string" && requested ? requested : signer;
  if (t !== signer && signer !== cfg.admin) throw new HttpError(403, "Solo esa fundación o el admin pueden editar este perfil");
  if (!StrKey.isValidEd25519PublicKey(t)) throw new HttpError(400, "Dirección inválida");
  return t;
}

/* ---------- Índice de eventos: copia en Supabase de los eventos de los contratos ---------- */
const server = new rpc.Server(RPC_URL);
const LOOKBACK = 120_000;
function jsonSafe(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return hex(v);
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]));
  return v;
}
function native(v: any): unknown {
  try {
    return jsonSafe(scValToNative(v));
  } catch {
    return null;
  }
}
const cursorLedger = (c: string) => {
  try {
    return Number(BigInt(c.split("-")[0]) >> 32n);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

async function syncEvents(deployment: string, force = false) {
  const cfg = configFor("campaigns", deployment) as (typeof CONFIGS)[number];
  const { data: st } = await db.from("bitajon_sync").select("cursor, synced_at").eq("deployment", deployment).maybeSingle();
  if (!force && st?.synced_at && Date.now() - Date.parse(st.synced_at) < 8000) return { inserted: 0, skipped: true };
  await db.from("bitajon_sync").upsert({ deployment, cursor: st?.cursor ?? null, synced_at: new Date().toISOString() });
  const filters = [{ type: "contract" as const, contractIds: [cfg.nonprofit, cfg.campaigns, cfg.vault, cfg.router] }];
  const limit = 200;
  let page: any;
  if (st?.cursor) {
    try {
      page = await server.getEvents({ cursor: st.cursor, filters, limit });
    } catch {
      page = null; // cursor fuera de la ventana de retención
    }
  }
  if (!page) {
    const latest = await server.getLatestLedger();
    let startLedger = Math.max(1, latest.sequence - LOOKBACK);
    try {
      page = await server.getEvents({ startLedger, filters, limit });
    } catch (err) {
      const m = String((err as Error)?.message ?? err).match(/range:?\s*(\d+)\s*-\s*(\d+)/i);
      if (!m) throw err;
      startLedger = Number(m[1]) + 1;
      page = await server.getEvents({ startLedger, filters, limit });
    }
  }
  let inserted = 0;
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    const rows = page.events.map((e: any) => {
      const topics = (e.topic ?? []).map(native);
      const value = native(e.value);
      const cid = typeof e.contractId === "string" ? e.contractId : e.contractId?.contractId?.() ?? String(e.contractId ?? "");
      return {
        deployment,
        id: e.id,
        contract_id: cid,
        name: String(topics[0] ?? "").toLowerCase().replace(/[_\s-]/g, ""),
        topics,
        data: value && typeof value === "object" && !Array.isArray(value) ? value : { value },
        ledger: e.ledger,
        closed_at: e.ledgerClosedAt,
        tx_hash: e.txHash ?? "",
      };
    });
    if (rows.length) {
      const { error } = await db.from("bitajon_events").upsert(rows, { ignoreDuplicates: true });
      if (error) throw new HttpError(500, error.message);
      inserted += rows.length;
    }
    if (page.cursor) await db.from("bitajon_sync").upsert({ deployment, cursor: page.cursor, ledger: page.latestLedger, synced_at: new Date().toISOString() });
    const reachedEnd = !page.cursor || cursorLedger(page.cursor) >= page.latestLedger;
    if ((reachedEnd && page.events.length < limit) || Date.now() - t0 > 40_000) break;
    page = await server.getEvents({ cursor: page.cursor, filters, limit });
  }
  return { inserted };
}

const clean = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function handle(body: any) {
  // Público: cualquiera puede pedir que se actualice el índice (los datos salen de la red, no del cliente).
  if (body.action === "sync-events") return syncEvents(String(body.deployment), false);
  const signer = await verifyAuth(body.auth);
  switch (body.action) {
    case "whoami":
      return { address: signer };

    case "upload-urls": {
      const kind = String(body.kind);
      const files = Array.isArray(body.files) ? body.files.slice(0, 12) : [];
      if (!MIME[kind] || files.length === 0) throw new HttpError(400, "Petición inválida");
      let bucket: string;
      let prefix: string;
      if (kind === "media" || kind === "evidence") {
        const campaignId = Number(body.campaign_id);
        await requireOwner(signer, String(body.registry), campaignId);
        bucket = kind === "media" ? BUCKET.media : BUCKET.evidence;
        prefix = `${body.registry}/${campaignId}/`;
      } else {
        const cfg = configFor("nonprofit", String(body.registry));
        const target = kind === "rut" ? signer : targetNonprofit(signer, cfg, body.address);
        bucket = kind === "rut" ? BUCKET.rut : BUCKET.media;
        prefix = kind === "rut" ? `${body.registry}/${signer}/` : `${body.registry}/nonprofits/${target}/`;
      }
      const out = [];
      for (const f of files) {
        if (!MIME[kind].includes(f.type)) throw new HttpError(400, `Tipo de archivo no permitido: ${f.type}`);
        if (!(f.size > 0 && f.size <= MAX[kind])) throw new HttpError(400, `Archivo muy grande (máx. ${Math.round(MAX[kind] / 1048576)} MB)`);
        const path = `${prefix}${crypto.randomUUID()}-${safeName(f.name).replace(/\.[^.]*$/, "")}.${EXT[f.type] ?? "bin"}`;
        const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
        if (error) throw new HttpError(500, error.message);
        out.push({ path, token: data.token, bucket });
      }
      return { uploads: out };
    }

    case "save-campaign": {
      const registry = String(body.registry);
      const campaignId = Number(body.campaign_id);
      await requireOwner(signer, registry, campaignId);
      const gallery = Array.isArray(body.gallery) ? body.gallery.slice(0, 12) : [];
      const cover = body.cover_path ?? null;
      assertPaths(cover ? [cover, ...gallery] : gallery, `${registry}/${campaignId}/`);
      const { error } = await db
        .from("bitajon_campaign_meta")
        .upsert({ registry, campaign_id: campaignId, cover_path: cover, gallery, updated_at: new Date().toISOString() });
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }

    case "save-nonprofit": {
      const registry = String(body.registry);
      const cfg = configFor("nonprofit", registry);
      const target = targetNonprofit(signer, cfg, body.address);
      const p = body.profile ?? {};
      if (p.logo_path) assertPaths([p.logo_path], `${registry}/nonprofits/${target}/`);
      const row = {
        registry,
        address: target,
        display_name: clean(p.display_name, 120),
        description: clean(p.description, 1200),
        website: clean(p.website),
        instagram: clean(p.instagram),
        facebook: clean(p.facebook),
        tiktok: clean(p.tiktok),
        x: clean(p.x),
        whatsapp: clean(p.whatsapp, 40),
        logo_path: p.logo_path ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("bitajon_nonprofit_meta").upsert(row);
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }

    case "save-rut": {
      const registry = String(body.registry);
      configFor("nonprofit", registry);
      const path = String(body.rut_path);
      assertPaths([path], `${registry}/${signer}/`);
      const { data, error } = await db.storage.from(BUCKET.rut).download(path);
      if (error || !data) throw new HttpError(400, "No se encontró el archivo del RUT");
      const hash = await sha256Hex(new Uint8Array(await data.arrayBuffer()));
      const { error: e2 } = await db
        .from("bitajon_nonprofit_private")
        .upsert({ registry, address: signer, rut_path: path, rut_sha256: hash, updated_at: new Date().toISOString() });
      if (e2) throw new HttpError(500, e2.message);
      return { ok: true, rut_sha256: hash };
    }

    case "save-evidence": {
      const registry = String(body.registry);
      const campaignId = Number(body.campaign_id);
      await requireOwner(signer, registry, campaignId);
      const text = String(body.manifest_text ?? "");
      let manifest: any;
      try {
        manifest = JSON.parse(text);
      } catch {
        throw new HttpError(400, "Manifiesto inválido");
      }
      const files = Array.isArray(manifest?.files) ? manifest.files : [];
      if (files.length === 0 || files.length > 12 || Number(manifest.campaign_id) !== campaignId) throw new HttpError(400, "Manifiesto inválido");
      assertPaths(files.map((f: any) => f.path), `${registry}/${campaignId}/`);
      // Se comprueba que cada archivo subido coincide con la huella declarada.
      for (const f of files) {
        const { data, error } = await db.storage.from(BUCKET.evidence).download(f.path);
        if (error || !data) throw new HttpError(400, `Falta el archivo ${f.name}`);
        const h = await sha256Hex(new Uint8Array(await data.arrayBuffer()));
        if (h !== f.sha256) throw new HttpError(400, `La huella de ${f.name} no coincide`);
      }
      const manifestHash = manifest.kind === "file" ? files[0].sha256 : await sha256Hex(text);
      const { error } = await db
        .from("bitajon_evidence")
        .upsert({ registry, campaign_id: campaignId, manifest_sha256: manifestHash, manifest, manifest_text: text });
      if (error) throw new HttpError(500, error.message);
      return { ok: true, manifest_sha256: manifestHash };
    }

    case "rut-url": {
      const registry = String(body.registry);
      const cfg = configFor("nonprofit", registry);
      if (signer !== cfg.admin) throw new HttpError(403, "Solo el admin puede ver el RUT");
      const address = String(body.address);
      const { data, error } = await db
        .from("bitajon_nonprofit_private")
        .select("rut_path, rut_sha256")
        .eq("registry", registry)
        .eq("address", address)
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!data) return { url: null };
      const signed = await db.storage.from(BUCKET.rut).createSignedUrl(data.rut_path, 600);
      if (signed.error) throw new HttpError(500, signed.error.message);
      return { url: signed.data.signedUrl, rut_sha256: data.rut_sha256 };
    }
    default:
      throw new HttpError(400, "Acción desconocida");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    return json(await handle(await req.json()));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return json({ error: e instanceof Error ? e.message : "Error" }, status);
  }
});
