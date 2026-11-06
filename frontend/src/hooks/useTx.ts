import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "../lib/errors";
import { explorer } from "../lib/format";
import type { MessageSigner } from "../lib/offchain";
import type { Signer, TxResult } from "../lib/stellar";
import { useWallet } from "../lib/wallet";
import { useRefreshAll } from "./queries";

type Messages = { loading: string; success: string };

/**
 * Ejecuta una transacción firmada con Freighter mostrando el progreso al usuario,
 * y refresca los datos al terminar.
 */
export function useTx() {
  const { address, signTransaction, signMessage } = useWallet();
  const refreshAll = useRefreshAll();
  const [pending, setPending] = useState(false);

  async function run<T>(
    fn: (signer: Signer & MessageSigner) => Promise<TxResult<T>>,
    msgs: Messages,
    opts: { campaignId?: bigint } = {},
  ): Promise<TxResult<T> | null> {
    if (!address) {
      toast.error("Conecta tu wallet para continuar.");
      return null;
    }
    setPending(true);
    const id = toast.loading(msgs.loading, { description: "Revisa la ventana de tu wallet para firmar." });
    try {
      const res = await fn({ address, signTransaction, signMessage });
      toast.success(msgs.success, {
        id,
        description: res.hash ? "Transacción confirmada en Stellar." : undefined,
        action: res.hash
          ? { label: "Ver", onClick: () => window.open(explorer.tx(res.hash), "_blank", "noopener") }
          : undefined,
      });
      await refreshAll(opts.campaignId);
      return res;
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err), { id, description: undefined });
      return null;
    } finally {
      setPending(false);
    }
  }

  return { run, pending };
}
