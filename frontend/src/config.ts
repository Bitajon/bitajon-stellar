import { Asset, Networks } from "@stellar/stellar-sdk";

// Toda la configuración sale de variables VITE_* (ver .env.example).
// Los valores por defecto son los contratos desplegados en testnet por Andrés.
const env = import.meta.env;
const pick = (value: string | undefined, fallback: string) =>
  value && value.trim() !== "" ? value.trim() : fallback;

export const NETWORK_PASSPHRASE = pick(env.VITE_NETWORK_PASSPHRASE, Networks.TESTNET);
export const IS_TESTNET = NETWORK_PASSPHRASE === Networks.TESTNET;
export const RPC_URL = pick(env.VITE_RPC_URL, "https://soroban-testnet.stellar.org");
export const HORIZON_URL = pick(env.VITE_HORIZON_URL, "https://horizon-testnet.stellar.org");
export const FRIENDBOT_URL = pick(env.VITE_FRIENDBOT_URL, "https://friendbot.stellar.org");
export const EXPLORER_URL = pick(env.VITE_EXPLORER_URL, "https://stellar.expert/explorer/testnet");

// Contratos v0.2.1 desplegados por Andrés (README del monorepo). El admin on-chain de los
// cuatro contratos es el governance-account (multisig Ed25519), no una wallet normal.
export const CONTRACTS = {
  nonprofitRegistry: pick(env.VITE_NONPROFIT_REGISTRY_ID, "CADYPVOA7SUTBVG5IICFNDHQKOXG7VLT6ANCNNOLNDKNFHFJWQ5N3RH2"),
  campaignRegistry: pick(env.VITE_CAMPAIGN_REGISTRY_ID, "CC5TYZBWM56HPTVBNUQYEX6VQBHU7ZOQGR2I3B42ZIGECQ3PWN6I7WJ6"),
  campaignVault: pick(env.VITE_CAMPAIGN_VAULT_ID, "CBX5Z2U67JYBI6OGGYMARJ5IT6TZS3TELIKGS2FJTODS4KSCC767HXWR"),
  donationRouter: pick(env.VITE_DONATION_ROUTER_ID, "CCK57ZWLKAUEC6DJ2GV3WHMJMO3ERN4H7K44TS36AMJ2N3S7VOREGR67"),
} as const;

export const GOVERNANCE_ID = pick(env.VITE_GOVERNANCE_ID, "CB5EDLYZ27U5JUNYCTLMANIMBV2WQ3DMXJV6AQJ7X43UYQ77EGX62X2U");

export const CONTRACT_LABELS: Record<keyof typeof CONTRACTS, [string, string]> = {
  nonprofitRegistry: ["Registro de fundaciones", "Nonprofit registry"],
  campaignRegistry: ["Registro de campañas", "Campaign registry"],
  campaignVault: ["Bóveda de custodia", "Custody vault"],
  donationRouter: ["Router de donaciones", "Donation router"],
};

/** Contrato SAC del token de las campañas. Por defecto, el XLM nativo de la red. */
export const TOKEN_ADDRESS = pick(env.VITE_TOKEN_ADDRESS, Asset.native().contractId(NETWORK_PASSPHRASE));
export const TOKEN_SYMBOL = pick(env.VITE_TOKEN_SYMBOL, "XLM");
export const TOKEN_DECIMALS = Number(pick(env.VITE_TOKEN_DECIMALS, "7"));

/** % que se libera al llegar a la meta: lo elige la fundación entre 1 y 90 (sugerido 50). */
export const MILESTONE_MIN = 1;
export const MILESTONE_MAX = 90;
export const MILESTONE_RECOMMENDED = 50;

/* Blux: login con correo para las fundaciones (App ID público del panel de Blux). */
export const BLUX_APP_ID = pick(env.VITE_BLUX_APP_ID, "uz6szcu7lig9vr4flovi");

/* Supabase: imágenes, redes sociales, evidencia y RUT (fuera de la cadena). */
export const SUPABASE_URL = pick(env.VITE_SUPABASE_URL, "https://vfvsdztgkndeundarbzw.supabase.co");
/** Llave pública (anon): solo permite leer; las escrituras pasan por la Edge Function. */
export const SUPABASE_ANON_KEY = pick(
  env.VITE_SUPABASE_ANON_KEY,
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdnNkenRna25kZXVuZGFyYnp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNzQ5MDMsImV4cCI6MjEwNzk1MDkwM30.Ac0MK2siEP4-jkNEIu6sF5up6usWeAg1izgxfqxLy78",
);
export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/bitajon`;
