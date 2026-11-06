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

export const CONTRACTS = {
  nonprofitRegistry: pick(
    env.VITE_NONPROFIT_REGISTRY_ID,
    "CA5LHUGEJ4S6XJV5ZBCOOKIWAARGA7QSZERAAUM2NVWCXHDPRRSFT55K",
  ),
  campaignRegistry: pick(
    env.VITE_CAMPAIGN_REGISTRY_ID,
    "CCZPWOKGTLT2UWLZEGYC55BPLR4GLZOUGCBVDXEEFSLE5QPVPMMU7EZR",
  ),
  campaignVault: pick(
    env.VITE_CAMPAIGN_VAULT_ID,
    "CARMUNTRKKX6KA7ZXVMYVZVAZ5DLZF5B53V5K6J5OE3CMFYGB7FWCCTT",
  ),
  donationRouter: pick(
    env.VITE_DONATION_ROUTER_ID,
    "CAZ5WAOUTXF5E6OWZ6AAIPQVUXLAJKNUTC3RG266Q47WR2LD2WJSRLSD",
  ),
} as const;

export const CONTRACT_LABELS: Record<keyof typeof CONTRACTS, string> = {
  nonprofitRegistry: "Registro de fundaciones",
  campaignRegistry: "Registro de campañas",
  campaignVault: "Bóveda de custodia",
  donationRouter: "Router de donaciones",
};

export const ADMIN_ADDRESS = pick(
  env.VITE_ADMIN_ADDRESS,
  "GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5",
);

/** Contrato SAC del token de las campañas. Por defecto, el XLM nativo de la red. */
export const TOKEN_ADDRESS = pick(env.VITE_TOKEN_ADDRESS, Asset.native().contractId(NETWORK_PASSPHRASE));
export const TOKEN_SYMBOL = pick(env.VITE_TOKEN_SYMBOL, "XLM");
export const TOKEN_DECIMALS = Number(pick(env.VITE_TOKEN_DECIMALS, "7"));

/** Porcentaje que se libera al llegar a la meta (DEFAULT_MILESTONE_PERCENTAGE en los contratos). */
export const MILESTONE_PERCENTAGE = 50;

/* Supabase: imágenes, redes sociales, evidencia y RUT (fuera de la cadena). */
export const SUPABASE_URL = pick(env.VITE_SUPABASE_URL, "https://vfvsdztgkndeundarbzw.supabase.co");
/** Llave pública (anon): solo permite leer; las escrituras pasan por la Edge Function. */
export const SUPABASE_ANON_KEY = pick(
  env.VITE_SUPABASE_ANON_KEY,
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdnNkenRna25kZXVuZGFyYnp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNzQ5MDMsImV4cCI6MjEwNzk1MDkwM30.Ac0MK2siEP4-jkNEIu6sF5up6usWeAg1izgxfqxLy78",
);
export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/bitajon`;
