import { Buffer } from "buffer";
import {
  getAddress,
  getNetworkDetails,
  isAllowed,
  isConnected,
  requestAccess,
  signMessage as freighterSignMessage,
  signTransaction as freighterSign,
} from "@stellar/freighter-api";
import type { SignTransaction } from "@stellar/stellar-sdk/contract";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ADMIN_ADDRESS, NETWORK_PASSPHRASE } from "../config";

const STORAGE_KEY = "bitajon.wallet.connected";

type WalletState = {
  /** Dirección G… conectada, o null. */
  address: string | null;
  /** true si la extensión Freighter está instalada. */
  installed: boolean | null;
  /** true si Freighter está en una red distinta a la de la app. */
  wrongNetwork: boolean;
  connecting: boolean;
  isAdmin: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Firmador compatible con los clientes de contrato del SDK. */
  signTransaction: SignTransaction;
  /** Firma un mensaje de texto (SEP-53) y devuelve la firma en base64. */
  signMessage: (message: string) => Promise<string>;
};

const WalletContext = createContext<WalletState | null>(null);

function readFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sin almacenamiento disponible */
  }
}

function errorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const checkNetwork = useCallback(async () => {
    try {
      const details = await getNetworkDetails();
      if (!details.error && details.networkPassphrase) {
        setWrongNetwork(details.networkPassphrase !== NETWORK_PASSPHRASE);
      }
    } catch {
      /* Freighter no responde: se ignora */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const conn = await isConnected();
      const has = Boolean(conn.isConnected);
      setInstalled(has);
      if (!has || !readFlag()) return;
      const allowed = await isAllowed();
      if (!allowed.isAllowed) return;
      const res = await getAddress();
      if (!res.error && res.address) {
        setAddress(res.address);
        await checkNetwork();
      }
    } catch {
      setInstalled(false);
    }
  }, [checkNetwork]);

  useEffect(() => {
    void refresh();
    // Si el usuario cambia de cuenta en Freighter, se actualiza al volver a la pestaña.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const conn = await isConnected();
      if (!conn.isConnected) {
        setInstalled(false);
        throw new Error("Freighter no está instalada en este navegador.");
      }
      setInstalled(true);
      const res = await requestAccess();
      if (res.error || !res.address) throw new Error(errorMessage(res.error) || "No se pudo conectar Freighter.");
      setAddress(res.address);
      writeFlag(true);
      await checkNetwork();
    } finally {
      setConnecting(false);
    }
  }, [checkNetwork]);

  const disconnect = useCallback(() => {
    writeFlag(false);
    setAddress(null);
  }, []);

  const signTransaction = useCallback<SignTransaction>(
    async (xdr, opts) => {
      const res = await freighterSign(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
        address: opts?.address ?? address ?? undefined,
      });
      if (res.error) throw new Error(errorMessage(res.error) || "Freighter rechazó la firma.");
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
    },
    [address],
  );

  const signMessage = useCallback(
    async (message: string) => {
      const res = await freighterSignMessage(message, { networkPassphrase: NETWORK_PASSPHRASE, address: address ?? undefined });
      if (res.error) throw new Error(errorMessage(res.error) || "La wallet rechazó la firma.");
      const sig = res.signedMessage as unknown;
      if (!sig) throw new Error("La wallet no devolvió la firma.");
      if (typeof sig === "string") return sig;
      // Versiones anteriores devuelven un Buffer.
      return Buffer.from(sig as Uint8Array).toString("base64");
    },
    [address],
  );

  const value = useMemo<WalletState>(
    () => ({
      address,
      installed,
      wrongNetwork,
      connecting,
      isAdmin: Boolean(address && address === ADMIN_ADDRESS),
      connect,
      disconnect,
      signTransaction,
      signMessage,
    }),
    [address, installed, wrongNetwork, connecting, connect, disconnect, signTransaction, signMessage],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet debe usarse dentro de <WalletProvider>");
  return ctx;
}
