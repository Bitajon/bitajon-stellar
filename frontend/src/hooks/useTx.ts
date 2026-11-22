import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "../lib/errors";
import { explorer } from "../lib/format";
import { tr } from "../lib/i18n";
import type { MessageSigner } from "../lib/offchain";
import type { Signer, TxResult } from "../lib/stellar";
import { useWallet } from "../lib/wallet";
import { useRefreshAll } from "./queries";

type Messages = {
  loading: string;
  success: string;
};

export function useTx() {
  const { address, googleUser, signTransaction, signMessage, openAuth } =
    useWallet();
  const refreshAll = useRefreshAll();
  const [pending, setPending] = useState(false);

  async function run<T>(
    fn: (signer: Signer & MessageSigner) => Promise<TxResult<T>>,
    msgs: Messages,
    opts: { campaignId?: bigint } = {},
  ): Promise<TxResult<T> | null> {
    if (!address) {
      toast.error(
        googleUser
          ? tr(
              `Vincula tu sesión de Google (${googleUser.email}) a una cuenta Stellar para firmar.`,
              `Link your Google session (${googleUser.email}) to a Stellar account to sign.`,
            )
          : tr(
              "Conecta tu wallet o entra con tu correo para continuar.",
              "Connect your wallet or sign in with email to continue.",
            ),
      );
      openAuth();
      return null;
    }

    setPending(true);
    const id = toast.loading(msgs.loading, {
      description: tr(
        "Revisa la ventana de tu wallet para firmar.",
        "Check your wallet window to sign.",
      ),
    });

    try {
      const res = await fn({ address, signTransaction, signMessage });
      toast.success(msgs.success, {
        id,
        description: res.hash
          ? tr(
              "Transacción confirmada en Stellar.",
              "Transaction confirmed on Stellar.",
            )
          : undefined,
        action: res.hash
          ? {
              label: tr("Ver", "View"),
              onClick: () =>
                window.open(explorer.tx(res.hash), "_blank", "noopener"),
            }
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
