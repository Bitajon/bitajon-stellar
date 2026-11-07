import { FRIENDBOT_URL, HORIZON_URL } from "../config";
import { parseAmount } from "./format";

/** Saldo nativo (XLM) de una cuenta en unidades mínimas, o null si la cuenta no existe. */
export async function getNativeBalance(address: string): Promise<bigint | null> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Horizon respondió ${res.status}`);
  const json = (await res.json()) as { balances?: { asset_type: string; balance: string }[] };
  const native = json.balances?.find((b) => b.asset_type === "native");
  return native ? parseAmount(native.balance) ?? 0n : 0n;
}

/** Fondea una cuenta nueva de testnet con XLM de prueba. */
export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Friendbot responde 400 si la cuenta ya existe y está fondeada.
    if (res.status === 400 && /already|exists|funded/i.test(text)) return;
    throw new Error("Friendbot no pudo fondear la cuenta. Inténtalo en un minuto.");
  }
}
