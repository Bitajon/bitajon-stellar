// Despliega una COPIA DE PRUEBA de los 4 contratos (desde los wasm ya instalados en testnet),
// crea cuentas de prueba y carga campañas en distintas etapas. No toca los contratos de Andrés.
//   node scripts/seed-demo.mjs
// Guarda el progreso en scripts/.demo-state.json (con llaves secretas de TESTNET: no se sube a git).
import { Asset, Keypair, Networks, contract } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STATE = resolve(here, ".demo-state.json");
const EVIDENCE_DIR = resolve(here, "../demo-evidencia");
const rpcUrl = "https://soroban-testnet.stellar.org";
const networkPassphrase = Networks.TESTNET;
const TOKEN = Asset.native().contractId(networkPassphrase);
const XLM = 10_000_000n;
const WASM = {
  nonprofit: "7376fe65dd8fa0611a2742a3cf4941c6a7dcc9b4578ac97c0f1b90c82a0703af",
  campaigns: "484493887c7b87e6be9436d9036a58142be1be6c13dac78ea0fd81b55b2e65e9",
  vault: "6ce4ac4e3c76a77f70e5c21b3550c1c5519505fca43b80e0739fbc13f68904d5",
  router: "bbcc1dbd99e15112dffc1f66ee49e7ad3f19fb60ad4feb934ae1724d5d24c356",
};

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { accounts: {}, contracts: {}, done: {} };
const save = () => writeFileSync(STATE, JSON.stringify(state, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function account(name) {
  if (!state.accounts[name]) {
    const kp = Keypair.random();
    state.accounts[name] = { publicKey: kp.publicKey(), secret: kp.secret() };
    save();
  }
  return state.accounts[name];
}
const kpOf = (name) => Keypair.fromSecret(account(name).secret);
const signerOf = (name) => ({ publicKey: account(name).publicKey, ...contract.basicNodeSigner(kpOf(name), networkPassphrase) });

async function fund(name) {
  const a = account(name);
  const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${a.publicKey}`);
  if (res.ok) return;
  const fb = await fetch(`https://friendbot.stellar.org/?addr=${a.publicKey}`);
  if (!fb.ok) throw new Error(`friendbot ${name}: ${fb.status}`);
  log("fondeada", name);
}

async function client(key, as) {
  return contract.Client.from({ contractId: state.contracts[key], networkPassphrase, rpcUrl, ...signerOf(as) });
}

// Si el script se cortó justo después de enviar, al reintentar el contrato responde "ya existe":
// esos códigos se toman como hechos (4 fundación ya registrada, 20 bóveda ya creada).
const ALREADY_DONE = /Error\(Contract, #(4|20)\)/;
async function send(tx, label) {
  if (tx.simulation?.error) {
    const msg = String(tx.simulation.error).split("\n")[0];
    if (ALREADY_DONE.test(msg)) { log("↷ ya estaba hecho:", label); return true; }
    throw new Error(`${label}: ${msg}`);
  }
  const sent = await tx.signAndSend({ force: true });
  log("✔", label);
  return sent.result;
}

async function once(key, fn) {
  if (state.done[key]) return state.done[key];
  const r = await fn();
  state.done[key] = r ?? true;
  save();
  return state.done[key];
}

async function deploy(key, args) {
  if (state.contracts[key]) return;
  const tx = await contract.Client.deploy(args, {
    wasmHash: WASM[key], format: "hex", networkPassphrase, rpcUrl, ...signerOf("admin"),
  });
  const c = await send(tx, `deploy ${key}`);
  state.contracts[key] = c.options.contractId;
  save();
}

const ROLES = ["admin", "fundacion_raices", "fundacion_luz", "donante_ana", "donante_carlos", "donante_sofia"];
for (const r of ROLES) await fund(r);
const A = (r) => account(r).publicKey;

// 1. Contratos (mismo orden y argumentos que el despliegue de Andrés; fee 0 bps)
await deploy("nonprofit", { admin: A("admin") });
await deploy("campaigns", { admin: A("admin"), nonprofit_registry: state.contracts.nonprofit });
await deploy("vault", { admin: A("admin"), campaign_registry: state.contracts.campaigns });
await deploy("router", { admin: A("admin"), treasury: A("admin"), campaign_vault: state.contracts.vault, fee_bps: 0 });
await once("router_set", async () =>
  send(await (await client("vault", "admin")).set_authorized_router({ admin: A("admin"), router: state.contracts.router }), "set_authorized_router"));

// 2. Fundaciones de demostración (nombres ficticios)
const FUNDS = {
  fundacion_raices: { legal_name: "Fundación Raíces del Sur (demo)", tax_id: "900.000.001-1", email: "raices.demo@bitajon.test" },
  fundacion_luz: { legal_name: "Fundación Luz de Tibabuyes (demo)", tax_id: "900.000.002-2", email: "luz.demo@bitajon.test" },
};
for (const [role, f] of Object.entries(FUNDS)) {
  await once(`register_${role}`, async () =>
    send(await (await client("nonprofit", role)).register_nonprofit({
      nonprofit: A(role),
      profile: { ...f, rut_hash: createHash("sha256").update(`RUT ${f.tax_id}`).digest(), retention_certificate: true, data_consent: true, status: { tag: "Pending", values: undefined } },
    }), `register ${role}`));
  await once(`approve_${role}`, async () =>
    send(await (await client("nonprofit", "admin")).approve_nonprofit({ admin: A("admin"), nonprofit: A(role) }), `approve ${role}`));
}

// 3. Campañas en distintas etapas
const in45 = BigInt(Math.floor(Date.now() / 1000) + 45 * 86400);
const CAMPAIGNS = [
  { key: "kits", owner: "fundacion_raices", name: "Kits escolares 2027 para 40 niños y niñas", location: "Patio Bonito, Bogotá", target: 500n,
    description: "Datos de demostración. Entregaremos 40 kits escolares (cuadernos, lápices, colores y morral) a niños y niñas de 5 a 12 años antes del inicio de clases. La evidencia será el acta de entrega firmada y las facturas de compra.",
    donations: [["donante_ana", 120n], ["donante_carlos", 60n]], evidence: null, release: false },
  { key: "navidad", owner: "fundacion_luz", name: "Navidad 2026: cena y regalos para 60 familias", location: "Tibabuyes, Suba, Bogotá", target: 300n,
    description: "Datos de demostración. Una cena navideña y un regalo por niño para 60 familias del barrio. La evidencia serán las facturas del mercado y el registro fotográfico de la entrega.",
    donations: [["donante_sofia", 150n], ["donante_ana", 150n]], evidence: null, release: false },
  { key: "fiesta", owner: "fundacion_raices", name: "Fiesta del niño en el comedor comunitario", location: "Patio Bonito, Bogotá", target: 200n,
    description: "Datos de demostración. Celebración del día del niño con refrigerio, recreación y un detalle para 80 niños y niñas que asisten al comedor comunitario.",
    donations: [["donante_carlos", 200n]], evidence: "fiesta", release: false },
  { key: "comedor", owner: "fundacion_luz", name: "Mercados para el comedor comunitario (noviembre)", location: "Tibabuyes, Suba, Bogotá", target: 150n,
    description: "Datos de demostración. Compra de los mercados de noviembre para el comedor comunitario que atiende a 30 niños y niñas en jornada alterna.",
    donations: [["donante_sofia", 100n], ["donante_ana", 50n]], evidence: "comedor", release: true },
  { key: "refrigerios", owner: "fundacion_luz", name: "Refrigerios para la jornada educativa alterna", location: "Tibabuyes, Suba, Bogotá", target: 400n,
    description: "Datos de demostración. Refrigerios diarios durante el primer semestre de 2027 para los niños y niñas de la jornada educativa alterna.",
    donations: [["donante_carlos", 40n]], evidence: null, release: false },
];

mkdirSync(EVIDENCE_DIR, { recursive: true });
for (const c of CAMPAIGNS) {
  const id = BigInt(await once(`create_${c.key}`, async () =>
    (await send(await (await client("campaigns", c.owner)).create_campaign({
      nonprofit: A(c.owner), name: c.name, description: c.description, location: c.location,
      target_amount: c.target * XLM, token_address: TOKEN, deadline: in45, milestone_percentage: 50,
    }), `create ${c.key}`)).toString()));
  await once(`vault_${c.key}`, async () => send(await (await client("vault", c.owner)).create_vault({ campaign_id: id, nonprofit: A(c.owner) }), `vault ${c.key} (#${id})`));
  for (const [i, [donor, amount]] of c.donations.entries()) {
    await once(`donate_${c.key}_${i}`, async () =>
      send(await (await client("router", donor)).donate({ campaign_id: id, donor: A(donor), amount: amount * XLM }), `donate ${c.key} ${donor} ${amount} XLM`));
  }
  if (c.evidence) {
    const file = resolve(EVIDENCE_DIR, `evidencia-${c.evidence}-demo.txt`);
    if (!existsSync(file))
      writeFileSync(file, `BITAJÓN · Evidencia de demostración\nCampaña #${id}: ${c.name}\nFundación: ${FUNDS[c.owner].legal_name}\nEste archivo es de prueba. Su huella SHA-256 está registrada en la bóveda de testnet.\n`);
    const hash = createHash("sha256").update(readFileSync(file)).digest();
    await once(`evidence_${c.key}`, async () =>
      send(await (await client("vault", c.owner)).submit_evidence({ campaign_id: id, nonprofit: A(c.owner), evidence_hash: hash }), `evidence ${c.key}`));
  }
  if (c.release)
    await once(`release_${c.key}`, async () => send(await (await client("vault", "admin")).release_final({ campaign_id: id, admin: A("admin") }), `release ${c.key}`));
}

writeFileSync(resolve(here, "../.env.demo.local"),
  `# Contratos de PRUEBA desplegados por scripts/seed-demo.mjs (no son los de Andrés)\n` +
  `VITE_NONPROFIT_REGISTRY_ID=${state.contracts.nonprofit}\nVITE_CAMPAIGN_REGISTRY_ID=${state.contracts.campaigns}\n` +
  `VITE_CAMPAIGN_VAULT_ID=${state.contracts.vault}\nVITE_DONATION_ROUTER_ID=${state.contracts.router}\nVITE_ADMIN_ADDRESS=${A("admin")}\n`);
log("LISTO", JSON.stringify(state.contracts));
