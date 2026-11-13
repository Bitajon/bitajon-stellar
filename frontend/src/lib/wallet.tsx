import { Buffer } from "buffer";
import { BluxProvider, networks, useBlux } from "@bluxcc/react";
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
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BLUX_APP_ID, FRIENDBOT_URL, IS_TESTNET, NETWORK_PASSPHRASE } from "../config";
import { getLang, tr } from "./i18n";
import { listAdmins } from "./offchain";

/*
 * Dos formas de entrar:
 *  - "wallet": Varial (antes Freighter). Es la de los donantes y de los admins.
 *  - "email":  cuenta con correo de Blux. Pensada para fundaciones que no manejan una wallet.
 *              Blux crea y custodia la cuenta Stellar; la app firma con ella igual que con Varial.
 * El resto de la app solo ve `address`, `signTransaction` y `signMessage`.
 */
export type LoginMode = "wallet" | "email";

const STORAGE_KEY = "bitajon.wallet.connected";

type WalletState = {
  /** Dirección G… activa, o null. */
  address: string | null;
  mode: LoginMode | null;
  /** Correo con el que entró (solo cuentas de correo). */
  email: string | null;
  /** true si la extensión Varial/Freighter está instalada. */
  installed: boolean | null;
  /** true si la wallet está en una red distinta a la de la app. */
  wrongNetwork: boolean;
  connecting: boolean;
  isAdmin: boolean;
  /** Conecta Varial como cuenta activa. */
  connect: () => Promise<void>;
  /** Abre el login con correo (Blux). */
  loginWithEmail: () => Promise<void>;
  disconnect: () => void;
  /** Pide a Varial su dirección sin cambiar la sesión activa (para vincular la wallet de retiro). */
  pickWalletAddress: () => Promise<string>;
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

/** Blux devuelve la firma/XDR en formatos distintos según el método de login. */
function pickString(v: unknown, keys: string[]): string | null {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString("base64");
  if (v && typeof v === "object") {
    for (const k of keys) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === "string") return x;
      if (x instanceof Uint8Array) return Buffer.from(x).toString("base64");
    }
  }
  return null;
}

/** En testnet, una cuenta nueva necesita XLM de prueba para existir y pagar comisiones. */
async function ensureTestnetFunds(address: string) {
  if (!IS_TESTNET) return;
  try {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    if (res.status === 404) await fetch(`${FRIENDBOT_URL}/?addr=${address}`);
  } catch {
    /* sin red: se intentará al firmar */
  }
}

/** Raíz: Blux por fuera (trae su propio QueryClient) y la wallet de BITAJÓN por dentro. */
export function WalletRoot({ children }: { children: ReactNode }) {
  const config = useMemo(
    () => ({
      appId: BLUX_APP_ID,
      appName: "BITAJÓN",
      networks: [IS_TESTNET ? networks.testnet : networks.mainnet],
      defaultNetwork: IS_TESTNET ? networks.testnet : networks.mainnet,
      loginMethods: ["email"],
      isPersistent: true,
      lang: getLang(),
      explorer: "stellarexpert" as const,
      appearance: {
        accentColor: "#1f8a5b",
        borderRadius: "16px",
        fontFamily: "var(--font-sans)",
        logo: "/brand/mark.png",
      },
    }),
    [],
  );
  return <BluxProvider config={config}>{children}</BluxProvider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const blux = useBlux();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const bluxAddress = blux.isAuthenticated ? (blux.user?.address ?? null) : null;
  const mode: LoginMode | null = bluxAddress ? "email" : walletAddress ? "wallet" : null;
  const address = bluxAddress ?? walletAddress;
  const email = bluxAddress ? (blux.user?.authValue ?? blux.user?.identifier ?? null) : null;

  const checkNetwork = useCallback(async () => {
    try {
      const details = await getNetworkDetails();
      if (!details.error && details.networkPassphrase) {
        setWrongNetwork(details.networkPassphrase !== NETWORK_PASSPHRASE);
      }
    } catch {
      /* la wallet no responde: se ignora */
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
        setWalletAddress(res.address);
        await checkNetwork();
      }
    } catch {
      setInstalled(false);
    }
  }, [checkNetwork]);

  useEffect(() => {
    void refresh();
    // Si el usuario cambia de cuenta en la wallet, se actualiza al volver a la pestaña.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (bluxAddress) void ensureTestnetFunds(bluxAddress);
  }, [bluxAddress]);

  const requestWallet = useCallback(async () => {
    const conn = await isConnected();
    if (!conn.isConnected) {
      setInstalled(false);
      throw new Error(tr("Varial no está instalada en este navegador.", "Varial is not installed in this browser."));
    }
    setInstalled(true);
    const res = await requestAccess();
    if (res.error || !res.address) throw new Error(errorMessage(res.error) || tr("No se pudo conectar la wallet.", "Could not connect the wallet."));
    return res.address;
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const a = await requestWallet();
      // Solo una sesión activa a la vez.
      if (blux.isAuthenticated) blux.logout();
      setWalletAddress(a);
      writeFlag(true);
      await checkNetwork();
    } finally {
      setConnecting(false);
    }
  }, [blux, checkNetwork, requestWallet]);

  const loginWithEmail = useCallback(async () => {
    setConnecting(true);
    try {
      const user = await blux.login();
      if (user?.address) {
        writeFlag(false);
        setWalletAddress(null);
        await ensureTestnetFunds(user.address);
      }
    } finally {
      setConnecting(false);
    }
  }, [blux]);

  const disconnect = useCallback(() => {
    writeFlag(false);
    setWalletAddress(null);
    if (blux.isAuthenticated) blux.logout();
  }, [blux]);

  const pickWalletAddress = useCallback(() => requestWallet(), [requestWallet]);

  const signTransaction = useCallback<SignTransaction>(
    async (xdr, opts) => {
      if (mode === "email") {
        const res = await blux.signTransaction(xdr, { network: opts?.networkPassphrase ?? NETWORK_PASSPHRASE });
        const signed = pickString(res, ["signedTxXdr", "signedXdr", "xdr", "signedTransaction"]);
        if (!signed) throw new Error(tr("La cuenta de correo no devolvió la firma.", "The email account did not return a signature."));
        return { signedTxXdr: signed, signerAddress: address ?? undefined };
      }
      const res = await freighterSign(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
        address: opts?.address ?? address ?? undefined,
      });
      if (res.error) throw new Error(errorMessage(res.error) || tr("La wallet rechazó la firma.", "The wallet rejected the signature."));
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
    },
    [address, blux, mode],
  );

  const signMessage = useCallback(
    async (message: string) => {
      if (mode === "email") {
        const res = await blux.signMessage(message);
        const sig = pickString(res, ["signedMessage", "signature", "signed"]);
        if (!sig) throw new Error(tr("La cuenta de correo no devolvió la firma.", "The email account did not return a signature."));
        return sig;
      }
      const res = await freighterSignMessage(message, { networkPassphrase: NETWORK_PASSPHRASE, address: address ?? undefined });
      if (res.error) throw new Error(errorMessage(res.error) || tr("La wallet rechazó la firma.", "The wallet rejected the signature."));
      const sig = res.signedMessage as unknown;
      if (!sig) throw new Error(tr("La wallet no devolvió la firma.", "The wallet did not return a signature."));
      if (typeof sig === "string") return sig;
      // Versiones anteriores devuelven un Buffer.
      return Buffer.from(sig as Uint8Array).toString("base64");
    },
    [address, blux, mode],
  );

  // Admins: lista pública en Supabase; las acciones igual se validan en el servidor.
  const admins = useQuery({ queryKey: ["admins"], queryFn: listAdmins, staleTime: 5 * 60_000 });
  const isAdmin = Boolean(address && admins.data?.some((a) => a.address === address));

  const value = useMemo<WalletState>(
    () => ({
      address,
      mode,
      email,
      installed,
      wrongNetwork: mode === "wallet" && wrongNetwork,
      connecting,
      isAdmin,
      connect,
      loginWithEmail,
      disconnect,
      pickWalletAddress,
      signTransaction,
      signMessage,
    }),
    [address, mode, email, installed, wrongNetwork, connecting, isAdmin, connect, loginWithEmail, disconnect, pickWalletAddress, signTransaction, signMessage],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet debe usarse dentro de <WalletProvider>");
  return ctx;
}
