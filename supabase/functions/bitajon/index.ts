// BITAJÓN · Edge Function "bitajon"
// Única puerta de escritura a Supabase. Cada petición firmada trae un mensaje firmado con la
// wallet (Varial/Freighter o la cuenta de correo de Blux) y la autoridad se comprueba en los contratos:
//  - imágenes / evidencia de una campaña: la fundación dueña (campaign.nonprofit on-chain) o un admin
//  - perfil / logo: esa misma fundación o un admin; RUT, correo y wallet de retiro: solo la fundación
//  - datos privados (RUT, correo): solo los admins
//  - "admin": aprobar/revocar fundaciones, pausar campañas, cambiar verificador y liberar el pago final.
//    Lo firma la llave del equipo, que es firmante del governance-account (multisig) y la
//    cuenta verificadora de las bóvedas. La llave la genera esta función y nunca sale de Supabase.
//  - "sync-events", "price" y "team-info" son públicas (solo leen la red o precios).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  contract,
  hash,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "npm:@stellar/stellar-sdk@17";
import { Buffer } from "node:buffer";

const RPC_URL = "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;
// Despliegues permitidos (IDs públicos). `governance` es el admin on-chain (multisig).
// Los de v0.1 (sin governance) se mantienen solo para servir sus datos ya guardados.
type Config = { name: string; governance?: string; nonprofit: string; campaigns: string; vault: string; router: string };
const CONFIGS: Config[] = [
  {
    name: "oficial-v0.2",
    governance: "CB5EDLYZ27U5JUNYCTLMANIMBV2WQ3DMXJV6AQJ7X43UYQ77EGX62X2U",
    nonprofit: "CADYPVOA7SUTBVG5IICFNDHQKOXG7VLT6ANCNNOLNDKNFHFJWQ5N3RH2",
    campaigns: "CC5TYZBWM56HPTVBNUQYEX6VQBHU7ZOQGR2I3B42ZIGECQ3PWN6I7WJ6",
    vault: "CBX5Z2U67JYBI6OGGYMARJ5IT6TZS3TELIKGS2FJTODS4KSCC767HXWR",
    router: "CCK57ZWLKAUEC6DJ2GV3WHMJMO3ERN4H7K44TS36AMJ2N3S7VOREGR67",
  },
  {
    name: "demo-v0.2",
    governance: "CCTSBAN4JXOBBSTYYRYTY53QWZV6ZELHEAE6KDBL4DHDPUWJWG3MHDLL",
    nonprofit: "CBAUFMMK7YEECISJ55XBCC3NGMPMJMZAHKK6Q5LN47P7SAEJ4QIE2AGC",
    campaigns: "CABGMDJG5Z7MGXAWCIHCHHKSWAKI4I2NMPSDKEKRMWI67LFG3TAXICGI",
    vault: "CCAA5XYWGQNJA5TTM2V6VZEETETT3SWMT4B4RJHSPH6SCTF77CYWTXLM",
    router: "CDGAHJRKPENZ3P3IMVMRLNQJBW4CN3FVRRVFDMDTJREKMFKUBRSO75FD",
  },
  {
    name: "oficial-v0.1",
    nonprofit: "CA5LHUGEJ4S6XJV5ZBCOOKIWAARGA7QSZERAAUM2NVWCXHDPRRSFT55K",
    campaigns: "CCZPWOKGTLT2UWLZEGYC55BPLR4GLZOUGCBVDXEEFSLE5QPVPMMU7EZR",
    vault: "CARMUNTRKKX6KA7ZXVMYVZVAZ5DLZF5B53V5K6J5OE3CMFYGB7FWCCTT",
    router: "CAZ5WAOUTXF5E6OWZ6AAIPQVUXLAJKNUTC3RG266Q47WR2LD2WJSRLSD",
  },
  {
    name: "demo-v0.1",
    nonprofit: "CCVKZINNVI3KT4NVDTLSGARRSA6VUS5LMOPVLC2LVIPJGTKZ5JTZSM4M",
    campaigns: "CBLOWODTDTCW3QEXRILELV7HFSV7AMTRRF4QC5WOYVRSZXWYE57IX4FF",
    vault: "CCG5H4OD35N5U2OUPSBO2USRGMWKCZ54WHDNIDEL3RPRTLRLAXICAFIQ",
    router: "CCWULVXPIT2NOY7QLBTXJVQORNKKPAUTZ5AGWEYEG6A24N6R36VHDC4I",
  },
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
const server = new rpc.Server(RPC_URL);

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

/* ---------------------------- Contratos ---------------------------- */
const clients = new Map<string, Promise<any>>();
function clientFor(id: string) {
  if (!clients.has(id)) clients.set(id, contract.Client.from({ contractId: id, networkPassphrase: PASSPHRASE, rpcUrl: RPC_URL }));
  return clients.get(id)!;
}
async function readContract(id: string, fn: string, args: Record<string, unknown>) {
  const c = await clientFor(id);
  const tx = await c[fn](args);
  if (tx.simulation?.error) throw new HttpError(400, String(tx.simulation.error));
  return tx.result;
}
async function campaignOwner(registry: string, id: number): Promise<string> {
  try {
    return String((await readContract(registry, "get_campaign", { campaign_id: BigInt(id) })).nonprofit);
  } catch {
    throw new HttpError(404, "La campaña no existe on-chain");
  }
}

function configFor(kind: "nonprofit" | "campaigns", registry: string) {
  const cfg = CONFIGS.find((c) => c[kind] === registry);
  if (!cfg) throw new HttpError(400, "Registro no permitido");
  return cfg;
}

async function isAdmin(signer: string, cfg: Config): Promise<boolean> {
  const { data } = await db.from("bitajon_admins").select("address").eq("registry", cfg.nonprofit).eq("address", signer).maybeSingle();
  return Boolean(data);
}
async function requireAdmin(signer: string, cfg: Config) {
  if (!(await isAdmin(signer, cfg))) throw new HttpError(403, "Solo un admin de BITAJÓN puede hacer esto");
}

const safeName = (n: string) => (n || "archivo").normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };

async function requireOwner(signer: string, registry: string, campaignId: number) {
  const cfg = configFor("campaigns", registry);
  if (!Number.isSafeInteger(campaignId) || campaignId < 1) throw new HttpError(400, "Campaña inválida");
  const owner = await campaignOwner(registry, campaignId);
  if (owner === signer || (await isAdmin(signer, cfg))) return;
  throw new HttpError(403, "Solo la fundación dueña de la campaña puede hacer esto");
}

function assertPaths(paths: unknown[], prefix: string) {
  for (const p of paths)
    if (typeof p !== "string" || !p.startsWith(prefix) || p.includes("..")) throw new HttpError(400, "Ruta de archivo inválida");
}

/** Una fundación edita su propio perfil; un admin puede editar el de cualquiera. */
async function targetNonprofit(signer: string, cfg: Config, requested: unknown): Promise<string> {
  const t = typeof requested === "string" && requested ? requested : signer;
  if (t !== signer && !(await isAdmin(signer, cfg))) throw new HttpError(403, "Solo esa fundación o un admin pueden editar este perfil");
  if (!StrKey.isValidEd25519PublicKey(t) && !StrKey.isValidContract(t)) throw new HttpError(400, "Dirección inválida");
  return t;
}

/* ----------------------- Llave del equipo -------------------------- */
let teamCache: Keypair | null = null;
async function teamKey(): Promise<Keypair> {
  if (teamCache) return teamCache;
  const { data } = await db.from("bitajon_team_key").select("secret").eq("id", "team").maybeSingle();
  if (data?.secret) return (teamCache = Keypair.fromSecret(data.secret));
  const kp = Keypair.random();
  await db.from("bitajon_team_key").insert({ id: "team", public_key: kp.publicKey(), secret: kp.secret() });
  // Si otra petición la creó al mismo tiempo, gana la que quedó guardada.
  const { data: saved } = await db.from("bitajon_team_key").select("secret").eq("id", "team").single();
  return (teamCache = Keypair.fromSecret(saved!.secret));
}

async function ensureFunded(pub: string) {
  try {
    await server.getAccount(pub);
  } catch {
    await fetch(`https://friendbot.stellar.org/?addr=${pub}`);
    await server.getAccount(pub);
  }
}

const INSTRUCTION_LEEWAY = 2_000_000;
const SIG_EXPIRATION_OFFSET = 100;

// Nota: el SDK 17.4 entrega las entradas XDR como objetos planos (propiedades, no métodos),
// igual que en contracts/scripts/bootstrap.mjs, del que se copia este flujo.

/** Prueba Ed25519 para el governance-account (envelope CAP-71, igual que bootstrap.mjs). */
function governanceProof(networkId: Buffer, addrCreds: any, invocation: any, expiration: number, kp: Keypair) {
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(
    new xdr.HashIdPreimageSorobanAuthorizationWithAddress({
      networkId,
      nonce: addrCreds.nonce,
      signatureExpirationLedger: expiration,
      address: addrCreds.address,
      invocation,
    } as any),
  );
  const payload = hash(preimage.toXDR());
  const proof = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("public_key"), val: xdr.ScVal.scvBytes(kp.rawPublicKey()) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("signature"), val: xdr.ScVal.scvBytes(kp.sign(payload)) }),
  ]);
  return xdr.ScVal.scvVec([proof]);
}

function toSorobanData(data: any): any {
  if (data instanceof xdr.SorobanTransactionData) return data;
  if (typeof data?.build === "function") return data.build();
  return data;
}

/** Invoca un contrato pagando y firmando con la llave del equipo; firma por el governance si hace falta. */
async function invokeAsTeam(contractId: string, fn: string, args: xdr.ScVal[], governance?: string) {
  const kp = await teamKey();
  await ensureFunded(kp.publicKey());
  const op = new Contract(contractId).call(fn, ...args);
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(op).setTimeout(60).build();
  const sim: any = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new HttpError(400, String(sim.error ?? "La simulación falló"));
  const networkId = hash(Buffer.from(PASSPHRASE));
  const expiration = sim.latestLedger + SIG_EXPIRATION_OFFSET;
  const auth = (sim.result?.auth ?? []).map((entry: any) => {
    const creds = entry.credentials;
    if (creds.type !== "sorobanCredentialsAddressV2" && creds.type !== "sorobanCredentialsAddress") return entry;
    const ac = creds.addressV2 ?? creds.address;
    const who = Address.fromScAddress(ac.address).toString();
    if (governance && who === governance) {
      const signature = governanceProof(networkId, ac, entry.rootInvocation, expiration, kp);
      const fields = new xdr.SorobanAddressCredentials({ address: ac.address, nonce: ac.nonce, signatureExpirationLedger: expiration, signature } as any);
      const newCreds =
        creds.type === "sorobanCredentialsAddressV2"
          ? (xdr.SorobanCredentials as any).sorobanCredentialsAddressV2(fields)
          : xdr.SorobanCredentials.sorobanCredentialsAddress(fields);
      return new xdr.SorobanAuthorizationEntry({ credentials: newCreds, rootInvocation: entry.rootInvocation } as any);
    }
    throw new HttpError(400, `La operación necesita la firma de ${who}, que el equipo no controla`);
  });
  const data: any = toSorobanData(sim.transactionData);
  const r = data.resources;
  const bumped = new xdr.SorobanTransactionData({
    ext: data.ext,
    resourceFee: data.resourceFee,
    resources: new xdr.SorobanResources({
      footprint: r.footprint,
      instructions: r.instructions + INSTRUCTION_LEEWAY,
      diskReadBytes: r.diskReadBytes,
      writeBytes: r.writeBytes,
    } as any),
  } as any);
  const hostFunc = xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({ contractAddress: Address.fromString(contractId).toScAddress(), functionName: fn, args } as any),
  );
  const account2 = await server.getAccount(kp.publicKey());
  const fee = (BigInt(BASE_FEE) + BigInt(sim.minResourceFee) + 200_000n).toString();
  const finalTx = new TransactionBuilder(account2, { fee, networkPassphrase: PASSPHRASE, sorobanData: bumped })
    .addOperation(Operation.invokeHostFunction({ func: hostFunc, auth }))
    .setTimeout(60)
    .build();
  finalTx.sign(kp);
  const sent: any = await server.sendTransaction(finalTx);
  if (sent.status === "ERROR") throw new HttpError(400, "La red rechazó la transacción");
  for (let i = 0; i < 30; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const got: any = await server.getTransaction(sent.hash);
    if (got.status === "SUCCESS") return { hash: sent.hash };
    if (got.status === "FAILED") throw new HttpError(400, `La transacción falló on-chain (${sent.hash})`);
  }
  return { hash: sent.hash, pending: true };
}

const addr = (a: string) => new Address(a).toScVal();
const u64 = (n: unknown) => nativeToScVal(BigInt(String(n)), { type: "u64" });

async function adminAction(signer: string, body: any) {
  const cfg = configFor("nonprofit", String(body.registry));
  if (!cfg.governance) throw new HttpError(400, "Este despliegue no usa admin multisig");
  await requireAdmin(signer, cfg);
  const gov = addr(cfg.governance);
  const team = await teamKey();
  switch (body.op) {
    case "approve":
    case "revoke":
      return invokeAsTeam(cfg.nonprofit, body.op === "approve" ? "approve_nonprofit" : "revoke_nonprofit", [gov, addr(String(body.nonprofit))], cfg.governance);
    case "pause":
    case "unpause":
      return invokeAsTeam(cfg.vault, body.op === "pause" ? "pause_vault" : "unpause_vault", [gov, u64(body.campaign_id)], cfg.governance);
    case "set-verifier":
      return invokeAsTeam(cfg.vault, "set_verifier_for_campaign", [gov, u64(body.campaign_id), addr(String(body.verifier || team.publicKey()))], cfg.governance);
    case "release-final": {
      const expected = String(body.expected_evidence ?? "");
      if (!/^[0-9a-f]{64}$/.test(expected)) throw new HttpError(400, "Falta la huella de la evidencia revisada");
      const vault = await readContract(cfg.vault, "get_vault", { campaign_id: BigInt(String(body.campaign_id)) });
      if (String(vault.verifier) !== team.publicKey())
        throw new HttpError(400, `El verificador de esta campaña es ${vault.verifier}; la llave del equipo no puede liberar. Cambia el verificador primero.`);
      return invokeAsTeam(cfg.vault, "release_final", [u64(body.campaign_id), addr(team.publicKey()), xdr.ScVal.scvBytes(Buffer.from(expected, "hex"))]);
    }
    case "add-admin": {
      const a = String(body.address);
      if (!StrKey.isValidEd25519PublicKey(a)) throw new HttpError(400, "Dirección inválida");
      await db.from("bitajon_admins").upsert({ registry: cfg.nonprofit, address: a, label: String(body.label ?? "").slice(0, 60) || null });
      return { ok: true };
    }
    case "remove-admin": {
      if (String(body.address) === signer) throw new HttpError(400, "No puedes quitarte a ti mismo");
      await db.from("bitajon_admins").delete().eq("registry", cfg.nonprofit).eq("address", String(body.address));
      return { ok: true };
    }
    default:
      throw new HttpError(400, "Acción de admin desconocida");
  }
}

async function teamInfo(registry: string) {
  const cfg = configFor("nonprofit", registry);
  const kp = await teamKey();
  let signer = false;
  let funded = true;
  if (cfg.governance) {
    try {
      signer = Boolean(await readContract(cfg.governance, "is_signer", { public_key: Buffer.from(kp.rawPublicKey()) }));
    } catch {
      signer = false;
    }
  }
  try {
    await server.getAccount(kp.publicKey());
  } catch {
    funded = false;
  }
  return { address: kp.publicKey(), public_key_hex: hex(kp.rawPublicKey()), governance: cfg.governance ?? null, is_signer: signer, funded };
}

/* ------------------------- Precio del XLM -------------------------- */
async function price() {
  const { data } = await db.from("bitajon_price").select("data, fetched_at").eq("id", "xlm").maybeSingle();
  if (data && Date.now() - Date.parse(data.fetched_at) < 5 * 60_000) return data.data;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd,cop&include_last_updated_at=true");
    const j = await res.json();
    const s = j?.stellar;
    if (!s?.usd || !s?.cop) throw new Error("sin precio");
    const out = { usd: s.usd, cop: s.cop, updated_at: new Date((s.last_updated_at ?? Date.now() / 1000) * 1000).toISOString(), source: "CoinGecko" };
    await db.from("bitajon_price").upsert({ id: "xlm", data: out, fetched_at: new Date().toISOString() });
    return out;
  } catch {
    if (data) return { ...data.data, stale: true };
    throw new HttpError(503, "No se pudo obtener el precio del XLM");
  }
}

/* ---------- Índice de eventos: copia en Supabase de los eventos de los contratos ---------- */
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

async function syncEvents(deployment: string) {
  const cfg = configFor("campaigns", deployment);
  const { data: st } = await db.from("bitajon_sync").select("cursor, synced_at").eq("deployment", deployment).maybeSingle();
  if (st?.synced_at && Date.now() - Date.parse(st.synced_at) < 8000) return { inserted: 0, skipped: true };
  await db.from("bitajon_sync").upsert({ deployment, cursor: st?.cursor ?? null, synced_at: new Date().toISOString() });
  const ids = [cfg.nonprofit, cfg.campaigns, cfg.vault, cfg.router];
  const filters = [{ type: "contract" as const, contractIds: ids }];
  const limit = 200;
  let page: any;
  if (st?.cursor) {
    try {
      page = await server.getEvents({ cursor: st.cursor, filters, limit });
    } catch {
      page = null;
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
  // Públicas: solo leen la red o precios, nunca datos enviados por el cliente.
  if (body.action === "sync-events") return syncEvents(String(body.deployment));
  if (body.action === "price") return price();
  if (body.action === "team-info") return teamInfo(String(body.registry));

  const signer = await verifyAuth(body.auth);
  switch (body.action) {
    case "whoami": {
      const cfg = body.registry ? configFor("nonprofit", String(body.registry)) : null;
      return { address: signer, admin: cfg ? await isAdmin(signer, cfg) : false };
    }

    case "admin":
      return adminAction(signer, body);

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
        const target = kind === "rut" ? signer : await targetNonprofit(signer, cfg, body.address);
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
      // Se aceptan rutas nuevas de esta campaña o las que ya estaban guardadas (p. ej. fotos
      // copiadas desde otro despliegue de prueba).
      const { data: current } = await db.from("bitajon_campaign_meta").select("cover_path, gallery").eq("registry", registry).eq("campaign_id", campaignId).maybeSingle();
      const kept = new Set<string>([current?.cover_path, ...((current?.gallery as string[]) ?? [])].filter(Boolean) as string[]);
      assertPaths((cover ? [cover, ...gallery] : gallery).filter((p: unknown) => !kept.has(String(p))), `${registry}/${campaignId}/`);
      const { error } = await db
        .from("bitajon_campaign_meta")
        .upsert({ registry, campaign_id: campaignId, cover_path: cover, gallery, updated_at: new Date().toISOString() });
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }

    case "save-nonprofit": {
      const registry = String(body.registry);
      const cfg = configFor("nonprofit", registry);
      const target = await targetNonprofit(signer, cfg, body.address);
      const p = body.profile ?? {};
      if (p.logo_path) assertPaths([p.logo_path], `${registry}/nonprofits/${target}/`);
      const row: Record<string, unknown> = {
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
      if (target === signer && p.login_method) row.login_method = clean(p.login_method, 20);
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
      const h = await sha256Hex(new Uint8Array(await data.arrayBuffer()));
      const { error: e2 } = await db
        .from("bitajon_nonprofit_private")
        .upsert({ registry, address: signer, rut_path: path, rut_sha256: h, updated_at: new Date().toISOString() });
      if (e2) throw new HttpError(500, e2.message);
      return { ok: true, rut_sha256: h };
    }

    case "save-private": {
      // Correo de contacto (en la cadena solo queda su hash) y wallet a la que la fundación retira fondos.
      const registry = String(body.registry);
      configFor("nonprofit", registry);
      const row: Record<string, unknown> = { registry, address: signer, updated_at: new Date().toISOString() };
      if (body.email !== undefined) {
        const email = String(body.email).trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Correo inválido");
        row.email = email;
      }
      if (body.payout_wallet !== undefined) {
        const w = String(body.payout_wallet ?? "").trim();
        if (w && !StrKey.isValidEd25519PublicKey(w)) throw new HttpError(400, "Wallet inválida");
        row.payout_wallet = w || null;
      }
      const { error } = await db.from("bitajon_nonprofit_private").upsert(row);
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }

    case "my-private": {
      const registry = String(body.registry);
      configFor("nonprofit", registry);
      const { data } = await db
        .from("bitajon_nonprofit_private")
        .select("email, payout_wallet, rut_sha256")
        .eq("registry", registry)
        .eq("address", signer)
        .maybeSingle();
      return data ?? {};
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

    case "rut-url":
    case "nonprofit-private": {
      const registry = String(body.registry);
      const cfg = configFor("nonprofit", registry);
      await requireAdmin(signer, cfg);
      const address = String(body.address);
      const { data, error } = await db
        .from("bitajon_nonprofit_private")
        .select("rut_path, rut_sha256, email, payout_wallet")
        .eq("registry", registry)
        .eq("address", address)
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!data) return { url: null };
      let url: string | null = null;
      if (data.rut_path) {
        const signed = await db.storage.from(BUCKET.rut).createSignedUrl(data.rut_path, 600);
        if (signed.error) throw new HttpError(500, signed.error.message);
        url = signed.data.signedUrl;
      }
      return { url, rut_sha256: data.rut_sha256, email: data.email, payout_wallet: data.payout_wallet };
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
