import { FRIENDBOT_URL, HORIZON_URL } from "../config";
import { parseAmount } from "./format";
import { tr } from "./i18n";

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
    throw new Error(tr("Friendbot no pudo fondear la cuenta. Inténtalo en un minuto.", "Friendbot could not fund the account. Try again in a minute."));
  }
}

/** Cuánto XLM se puede enviar sin bajar del saldo mínimo que exige la red (reserva + margen para comisiones). */
export async function spendableBalance(address: string): Promise<bigint> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (!res.ok) return 0n;
  const a = (await res.json()) as {
    balances?: { asset_type: string; balance: string; selling_liabilities?: string }[];
    subentry_count?: number;
    num_sponsoring?: number;
    num_sponsored?: number;
  };
  const native = a.balances?.find((b) => b.asset_type === "native");
  const balance = parseAmount(native?.balance ?? "0") ?? 0n;
  const liabilities = parseAmount(native?.selling_liabilities ?? "0") ?? 0n;
  const entries = 2 + (a.subentry_count ?? 0) + (a.num_sponsoring ?? 0) - (a.num_sponsored ?? 0);
  const reserve = BigInt(entries) * 5_000_000n; // 0,5 XLM por entrada
  const margin = 5_000_000n; // 0,5 XLM para comisiones futuras
  const free = balance - liabilities - reserve - margin;
  return free > 0n ? free : 0n;
}

/** Envía XLM a otra cuenta (p. ej. de la cuenta de correo a la wallet propia de la fundación). */
export async function sendXlm(
  signer: { address: string; signTransaction: (xdr: string, opts?: { networkPassphrase?: string; address?: string }) => Promise<{ signedTxXdr: string }> },
  to: string,
  amountUnits: bigint,
): Promise<{ result: null; hash: string }> {
  const { Asset, Horizon, Operation, TransactionBuilder } = await import("@stellar/stellar-sdk");
  const { NETWORK_PASSPHRASE } = await import("../config");
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(signer.address);
  const whole = amountUnits / 10_000_000n;
  const frac = (amountUnits % 10_000_000n).toString().padStart(7, "0");
  const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: to, asset: Asset.native(), amount: `${whole}.${frac}` }))
    .setTimeout(120)
    .build();
  const { signedTxXdr } = await signer.signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE, address: signer.address });
  const signed = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const res = await server.submitTransaction(signed);
  return { result: null, hash: res.hash };
}
