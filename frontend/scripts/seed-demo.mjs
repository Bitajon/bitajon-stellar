// Datos de demostración para los contratos de PRUEBA v0.2.1 (.env.demo).
// Crea fundaciones, campañas en todas las etapas (activa, meta alcanzada, evidencia en revisión,
// completada, pausada y vencida con reembolso pendiente), donaciones y evidencia con archivos.
// Usa los mismos caminos que la página: contratos firmados por cada cuenta y, para lo de admin,
// la Edge Function "bitajon" (firma la cuenta del equipo por el governance-account).
//
//   node scripts/seed-demo.mjs
//
// Es reanudable: guarda el progreso en scripts/.demo-state.json (ignorado por git, tiene llaves
// de prueba de testnet). Si se corta, vuelve a correrlo y sigue donde iba.
import { Asset, Keypair, Networks, contract } from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STATE = resolve(here, ".demo-state.json");
const MEDIA = resolve(here, "../demo-media");
const S = JSON.parse(readFileSync(STATE, "utf8"));
S.v2 ??= { done: {}, campaigns: {} };
const save = () => writeFileSync(STATE, JSON.stringify(S, null, 2));

const env = Object.fromEntries(
  readFileSync(resolve(here, "../.env.demo"), "utf8")
    .split("\n")
    .map((l) => l.match(/^(VITE_[A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const NP = env.VITE_NONPROFIT_REGISTRY_ID;
const CR = env.VITE_CAMPAIGN_REGISTRY_ID;
const CV = env.VITE_CAMPAIGN_VAULT_ID;
const DR = env.VITE_DONATION_ROUTER_ID;

const SUPABASE_URL = "https://vfvsdztgkndeundarbzw.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdnNkenRna25kZXVuZGFyYnp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNzQ5MDMsImV4cCI6MjEwNzk1MDkwM30.Ac0MK2siEP4-jkNEIu6sF5up6usWeAg1izgxfqxLy78";
const FN = `${SUPABASE_URL}/functions/v1/bitajon`;
const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
const rpcUrl = "https://soroban-testnet.stellar.org";
const networkPassphrase = Networks.TESTNET;
const XLM = 10_000_000n;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sha = (b) => createHash("sha256").update(b).digest();

/* ---------------- ayudantes ---------------- */
const acct = (role) => S.accounts[role];
function auth(role) {
  const kp = Keypair.fromSecret(acct(role).secret);
  const message = `BITAJON auth\naddress:${kp.publicKey()}\nissued:${new Date().toISOString()}\nnonce:${Math.random().toString(16).slice(2)}`;
  const digest = sha(Buffer.concat([Buffer.from("Stellar Signed Message:\n"), Buffer.from(message)]));
  return { address: kp.publicKey(), message, signature: Buffer.from(kp.sign(digest)).toString("base64") };
}
async function edge(action, body, role) {
  const r = await fetch(FN, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ ...body, action, ...(role ? { auth: auth(role) } : {}) }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${action}: ${j.error}`);
  return j;
}
const admin = (op) => edge("admin", { registry: NP, ...op }, "admin");

const clients = new Map();
async function client(id, role) {
  const key = `${id}:${role}`;
  if (!clients.has(key)) {
    const kp = Keypair.fromSecret(acct(role).secret);
    clients.set(key, await contract.Client.from({ contractId: id, networkPassphrase, rpcUrl, publicKey: kp.publicKey(), ...contract.basicNodeSigner(kp, networkPassphrase) }));
  }
  return clients.get(key);
}
async function send(id, role, fn, args) {
  const c = await client(id, role);
  const tx = await c[fn](args);
  if (tx.simulation?.error) throw new Error(`${fn}: ${String(tx.simulation.error).split("\n")[0]}`);
  const sent = await tx.signAndSend({ force: true });
  return sent.result?.unwrap ? sent.result.unwrap() : sent.result;
}
async function once(key, fn) {
  if (S.v2.done[key]) return;
  await fn();
  S.v2.done[key] = true;
  save();
  log("✔", key);
}

const TYPES = { jpg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
async function upload(role, kind, scope, names) {
  const files = names.map((n) => ({ name: n, data: readFileSync(resolve(MEDIA, n)), type: TYPES[n.split(".").pop()] }));
  const { uploads } = await edge("upload-urls", { kind, ...scope, files: files.map((f) => ({ name: f.name, type: f.type, size: f.data.length })) }, role);
  for (const [i, u] of uploads.entries()) {
    const { error } = await sb.storage.from(u.bucket).uploadToSignedUrl(u.path, u.token, files[i].data, { contentType: files[i].type });
    if (error) throw error;
  }
  return uploads.map((u, i) => ({ ...files[i], path: u.path }));
}

/* ---------------- 1. Fundaciones ---------------- */
const FOUNDATIONS = {
  fundacion_raices: {
    legal_name: "Fundación Raíces del Sur (demo)",
    tax_id: "900.111.222-3",
    email: "contacto@raicesdelsur.demo",
    description: "Fundación de demostración. Acompañamos a niños, niñas y adolescentes de Patio Bonito con comedor comunitario, refuerzo escolar y actividades culturales.",
    instagram: "@raicesdelsur.demo",
    approve: true,
  },
  fundacion_luz: {
    legal_name: "Fundación Luz de Tibabuyes (demo)",
    tax_id: "901.333.444-5",
    email: "hola@luzdetibabuyes.demo",
    description: "Fundación de demostración. Trabajamos con familias de Tibabuyes (Suba) con jornada educativa alterna y mercados para el comedor comunitario.",
    facebook: "facebook.com/luzdetibabuyes.demo",
    approve: true,
  },
  fundacion_semillas: {
    legal_name: "Fundación Semillas de Paz (demo)",
    tax_id: "901.555.666-7",
    email: "info@semillasdepaz.demo",
    description: "Fundación de demostración pendiente de aprobación: sirve para probar la revisión del RUT y del correo en el panel de admin.",
    rut: "rut-semillas-demo.pdf",
    approve: false,
  },
};

for (const [role, f] of Object.entries(FOUNDATIONS)) {
  const rutBytes = f.rut ? readFileSync(resolve(MEDIA, f.rut)) : Buffer.from(`RUT de demostración de ${f.legal_name}`);
  await once(`register_${role}`, async () => {
    await send(NP, role, "register_nonprofit", {
      nonprofit: acct(role).publicKey,
      profile: {
        legal_name: f.legal_name,
        tax_id: f.tax_id,
        rut_hash: sha(rutBytes),
        email_hash: sha(Buffer.from(f.email.toLowerCase())),
        retention_certificate: role !== "fundacion_semillas",
        data_consent: true,
        status: { tag: "Pending", values: undefined },
      },
    });
  });
  await once(`private_${role}`, async () => {
    if (f.rut) {
      const [u] = await upload(role, "rut", { registry: NP }, [f.rut]);
      await edge("save-rut", { registry: NP, rut_path: u.path }, role);
    }
    await edge("save-private", { registry: NP, email: f.email }, role);
  });
  await once(`profile_${role}`, () =>
    edge("save-nonprofit", { registry: NP, profile: { display_name: f.legal_name, description: f.description, instagram: f.instagram, facebook: f.facebook, login_method: "wallet" } }, role),
  );
  if (f.approve) await once(`approve_${role}`, () => admin({ op: "approve", nonprofit: acct(role).publicKey }));
}

/* ---------------- 2. Campañas ---------------- */
const team = await edge("team-info", { registry: NP });
if (!team.is_signer) throw new Error("La cuenta del equipo no es firmante del governance de demo. Corre contracts/scripts/add-signer.mjs primero.");
const now = () => Math.floor(Date.now() / 1000);

const PLAN = [
  { key: "kits", owner: "fundacion_raices", name: "Kits escolares 2027 para Patio Bonito", location: "Patio Bonito, Bogotá", target: 1500, milestone: 50,
    description: "Queremos entregar 60 kits escolares (cuadernos, colores, maletín y uniforme de educación física) a los niños y niñas del comedor comunitario antes del inicio de clases. Publicaremos las facturas y el acta de entrega firmada por los acudientes.",
    donations: [["donante_ana", 300], ["donante_carlos", 250]] },
  { key: "navidad", owner: "fundacion_luz", name: "Navidad en Tibabuyes", location: "Tibabuyes, Suba", target: 800, milestone: 40,
    description: "Una novena y cena navideña para 45 familias de la jornada alterna, con un regalo para cada niño y niña. Al llegar a la meta compramos los mercados y los regalos; después subimos las facturas y fotos.",
    donations: [["donante_ana", 500], ["donante_sofia", 300]] },
  { key: "fiesta", owner: "fundacion_raices", name: "Fiesta del niño en el salón comunal", location: "Patio Bonito, Bogotá", target: 600, milestone: 50,
    description: "Celebración del día del niño para 70 niños y niñas: refrigerios, recreacionistas y un detalle para cada uno. La evidencia (acta y fotos de la entrega) ya está publicada.",
    donations: [["donante_carlos", 600]], evidence: ["evid-entrega.jpg", "acta-fiesta-demo.pdf"],
    note: "El 25 de abril celebramos el día del niño con 70 niños y niñas en el salón comunal. Adjuntamos el acta firmada y una foto de la entrega." },
  { key: "comedor", owner: "fundacion_luz", name: "Mercados para el comedor comunitario", location: "Tibabuyes, Suba", target: 400, milestone: 60,
    description: "Mercados para un mes del comedor comunitario (almuerzo para 35 niños y niñas). Campaña completada: la evidencia fue validada y se liberó el 100%.",
    donations: [["donante_ana", 200], ["donante_sofia", 200]], evidence: ["evid-entrega.jpg"], release: true,
    note: "Compramos los mercados del mes y los entregamos al comedor. Adjuntamos foto de la entrega." },
  { key: "biblioteca", owner: "fundacion_raices", name: "Biblioteca comunitaria", location: "Kennedy, Bogotá", target: 1000, milestone: 30,
    description: "Libros, estantes y cojines para abrir una biblioteca comunitaria. Campaña de demostración pausada por el admin: sirve para probar la pausa y el reembolso.",
    donations: [["donante_sofia", 100]], pause: true },
  { key: "refrigerios", owner: "fundacion_luz", name: "Refrigerios para la jornada alterna", location: "Suba, Bogotá", target: 500, milestone: 50, deadlineSec: 150,
    description: "Refrigerios para la jornada alterna del segundo semestre. Campaña de demostración que venció sin llegar a la meta: quienes donaron pueden pedir su reembolso.",
    donations: [["donante_carlos", 120]] },
];

for (const p of PLAN) {
  await once(`campaign_${p.key}`, async () => {
    const deadline = BigInt(now() + (p.deadlineSec ?? 45 * 86400));
    const id = await send(CR, p.owner, "create_campaign", {
      nonprofit: acct(p.owner).publicKey,
      name: p.name,
      description: p.description,
      location: p.location,
      target_amount: BigInt(p.target) * XLM,
      token_address: Asset.native().contractId(networkPassphrase),
      deadline,
      milestone_percentage: p.milestone,
    });
    S.v2.campaigns[p.key] = Number(id);
    save();
  });
  const id = BigInt(S.v2.campaigns[p.key]);
  await once(`vault_${p.key}`, () => send(CV, p.owner, "create_vault", { campaign_id: id, nonprofit: acct(p.owner).publicKey, verifier: team.address }));
  for (const [i, [donor, amount]] of p.donations.entries())
    await once(`donate_${p.key}_${i}`, () => send(DR, donor, "donate", { campaign_id: id, donor: acct(donor).publicKey, amount: BigInt(amount) * XLM }));
  if (p.evidence)
    await once(`evidence_${p.key}`, async () => {
      const files = await upload(p.owner, "evidence", { registry: CR, campaign_id: Number(id) }, p.evidence);
      const manifest = JSON.stringify({
        version: 1,
        campaign_id: Number(id),
        note: p.note,
        files: files.map((f) => ({ name: f.name, path: f.path, sha256: sha(f.data).toString("hex"), size: f.data.length, type: f.type })),
      });
      const { manifest_sha256 } = await edge("save-evidence", { registry: CR, campaign_id: Number(id), manifest_text: manifest }, p.owner);
      await send(CV, p.owner, "submit_evidence", { campaign_id: id, nonprofit: acct(p.owner).publicKey, evidence_hash: Buffer.from(manifest_sha256, "hex") });
      S.v2.campaigns[`${p.key}_evidence`] = manifest_sha256;
      save();
    });
  if (p.release)
    await once(`release_${p.key}`, () => admin({ op: "release-final", campaign_id: Number(id), expected_evidence: S.v2.campaigns[`${p.key}_evidence`] }));
  if (p.pause) await once(`pause_${p.key}`, () => admin({ op: "pause", campaign_id: Number(id) }));
}

await edge("sync-events", { deployment: CR }).catch(() => null);
log("Listo. Campañas:", S.v2.campaigns);
