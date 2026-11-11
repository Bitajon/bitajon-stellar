/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK_PASSPHRASE?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_HORIZON_URL?: string;
  readonly VITE_FRIENDBOT_URL?: string;
  readonly VITE_EXPLORER_URL?: string;
  readonly VITE_NONPROFIT_REGISTRY_ID?: string;
  readonly VITE_CAMPAIGN_REGISTRY_ID?: string;
  readonly VITE_CAMPAIGN_VAULT_ID?: string;
  readonly VITE_DONATION_ROUTER_ID?: string;
  readonly VITE_GOVERNANCE_ID?: string;
  readonly VITE_BLUX_APP_ID?: string;
  readonly VITE_TOKEN_ADDRESS?: string;
  readonly VITE_TOKEN_SYMBOL?: string;
  readonly VITE_TOKEN_DECIMALS?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
