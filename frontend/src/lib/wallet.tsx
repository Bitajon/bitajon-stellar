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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  BLUX_APP_ID,
  FRIENDBOT_URL,
  IS_TESTNET,
  NETWORK_PASSPHRASE,
} from "../config";
import { getLang, tr } from "./i18n";
import { listAdmins } from "./offchain";

export type LoginMode = "wallet" | "email";

export type GoogleUser = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  linkedAddress?: string | null;
};

const STORAGE_KEY = "bitajon.wallet.connected";
const GOOGLE_USER_KEY = "bitajon.google.user";

type WalletState = {
  /** Dirección G… activa, o null. */
  address: string | null;
  mode: LoginMode | null;
  /** Correo con el que entró (solo cuentas de correo o sesión de Google). */
  email: string | null;
  /** Sesión de Google activa (si el usuario inició sesión con Google). */
  googleUser: GoogleUser | null;
  /** true si la extensión Varial/Freighter está instalada. */
  installed: boolean | null;
  /** true si la wallet está en una red distinta a la de la app. */
  wrongNetwork: boolean;
  connecting: boolean;
  isAdmin: boolean;
  /** Dispara directamente el inicio de sesión sin modal intermedio. */
  openAuth: () => void;
  /** Conecta Varial como cuenta activa. */
  connect: () => Promise<void>;
  /** Abre el login con correo/Google/wallets/passkey (Blux). */
  loginWithEmail: () => Promise<void>;
  /** Inicia sesión con Google (o cae en login de Blux si no hay client ID configurado). */
  loginWithGoogle: () => void;
  /** Procesa un id_token de Google y persiste el usuario. */
  completeGoogleLogin: (idToken: string) => GoogleUser | null;
  /** Vincula el usuario de Google a una dirección Stellar (G...). */
  linkGoogleToAddress: (stellarAddress?: string | null) => GoogleUser | null;
  /** Cierra la sesión de Google. */
  logoutGoogle: () => void;
  disconnect: () => void;
  /** Pide a Varial su dirección sin cambiar la sesión activa. */
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

function readGoogleUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(GOOGLE_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoogleUser;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

function writeGoogleUser(user: GoogleUser | null) {
  try {
    if (user) localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(GOOGLE_USER_KEY);
  } catch {
    /* sin almacenamiento disponible */
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
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

/** Solicita XLM de prueba en testnet usando Friendbot. */
export async function fundWithFriendbot(address: string): Promise<void> {
  if (!IS_TESTNET) return;
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    throw new Error(
      tr(
        "No se pudieron obtener XLM de prueba en testnet.",
        "Could not fetch testnet XLM from Friendbot.",
      ),
    );
  }
}

/** En testnet, una cuenta nueva necesita XLM de prueba para existir y pagar comisiones. */
async function ensureTestnetFunds(address: string) {
  if (!IS_TESTNET) return;
  try {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    if (res.status === 404) await fundWithFriendbot(address);
  } catch {
    /* sin red: se intentará al firmar */
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const blux = useBlux();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(() =>
    readGoogleUser(),
  );
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const bluxAddress = blux.isAuthenticated ? (blux.user?.address ?? null) : null;
  const mode: LoginMode | null = bluxAddress
    ? "email"
    : walletAddress
      ? "wallet"
      : null;
  const address = bluxAddress ?? walletAddress;
  const email = bluxAddress
    ? (blux.user?.authValue ?? blux.user?.identifier ?? googleUser?.email ?? null)
    : (googleUser?.email ?? null);

  const linkGoogleToAddress = useCallback(
    (stellarAddress?: string | null): GoogleUser | null => {
      const targetAddress = stellarAddress ?? address;
      if (!googleUser || !targetAddress) return googleUser;
      const updated: GoogleUser = {
        ...googleUser,
        linkedAddress: targetAddress,
      };
      setGoogleUser(updated);
      writeGoogleUser(updated);
      return updated;
    },
    [address, googleUser],
  );

  useEffect(() => {
    if (googleUser && address && googleUser.linkedAddress !== address) {
      const updated: GoogleUser = { ...googleUser, linkedAddress: address };
      setGoogleUser(updated);
      writeGoogleUser(updated);
    }
  }, [address, googleUser]);

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
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (bluxAddress) void ensureTestnetFunds(bluxAddress);
  }, [bluxAddress]);

  const requestWallet = useCallback(async (): Promise<string> => {
    const conn = await isConnected();
    if (!conn.isConnected) {
      setInstalled(false);
      throw new Error(
        tr(
          "Varial no está instalada en este navegador.",
          "Varial is not installed in this browser.",
        ),
      );
    }
    setInstalled(true);
    const allowed = await isAllowed();
    if (!allowed?.isAllowed) {
      const access = await requestAccess();
      if (access?.error) {
        throw new Error(
          errorMessage(access.error) ||
            tr("Se canceló el acceso a la wallet.", "Wallet access was cancelled."),
        );
      }
    }
    const addrRes = await getAddress();
    if (addrRes?.error || !addrRes?.address) {
      throw new Error(
        errorMessage(addrRes?.error) ||
          tr("No se pudo conectar la wallet.", "Could not connect the wallet."),
      );
    }
    return addrRes.address;
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const a = await requestWallet();
      if (blux.isAuthenticated) blux.logout();
      setWalletAddress(a);
      writeFlag(true);
      await checkNetwork();
      if (googleUser) {
        const updated: GoogleUser = { ...googleUser, linkedAddress: a };
        setGoogleUser(updated);
        writeGoogleUser(updated);
      }
    } finally {
      setConnecting(false);
    }
  }, [blux, checkNetwork, googleUser, requestWallet]);

  const loginWithEmail = useCallback(async () => {
    setConnecting(true);
    try {
      const user = await blux.login();
      if (user?.address) {
        writeFlag(false);
        setWalletAddress(null);
        await ensureTestnetFunds(user.address);
        if (googleUser) {
          const updated: GoogleUser = {
            ...googleUser,
            linkedAddress: user.address,
          };
          setGoogleUser(updated);
          writeGoogleUser(updated);
        }
      }
    } finally {
      setConnecting(false);
    }
  }, [blux, googleUser]);

  const openAuth = useCallback(() => {
    void loginWithEmail();
  }, [loginWithEmail]);

  const completeGoogleLogin = useCallback(
    (idToken: string): GoogleUser | null => {
      const payload = decodeJwtPayload(idToken);
      const sub = typeof payload?.sub === "string" ? payload.sub : "";
      const mail = typeof payload?.email === "string" ? payload.email : "";
      const name =
        typeof payload?.name === "string" && payload.name.trim()
          ? payload.name.trim()
          : mail;
      const picture =
        typeof payload?.picture === "string" ? payload.picture : undefined;
      if (!sub || !mail) return null;
      const nextUser: GoogleUser = {
        sub,
        email: mail,
        name,
        picture,
        linkedAddress: address ?? googleUser?.linkedAddress ?? null,
      };
      setGoogleUser(nextUser);
      writeGoogleUser(nextUser);
      return nextUser;
    },
    [address, googleUser?.linkedAddress],
  );

  const loginWithGoogle = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) {
      toast.info(
        tr(
          "Configura VITE_GOOGLE_CLIENT_ID o usa el acceso de Blux para continuar.",
          "Configure VITE_GOOGLE_CLIENT_ID or use Blux login to continue.",
        ),
      );
      void loginWithEmail();
      return;
    }
    const nonce = crypto.randomUUID();
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "id_token");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("nonce", nonce);
    window.location.assign(url.toString());
  }, [loginWithEmail]);

  const logoutGoogle = useCallback(() => {
    setGoogleUser(null);
    writeGoogleUser(null);
  }, []);

  const disconnect = useCallback(() => {
    writeFlag(false);
    setWalletAddress(null);
    if (blux.isAuthenticated) blux.logout();
  }, [blux]);

  const pickWalletAddress = useCallback(() => requestWallet(), [requestWallet]);

  const signTransaction = useCallback<SignTransaction>(
    async (xdr, opts) => {
      if (mode === "email") {
        const res = await blux.signTransaction(xdr, {
          network: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
        });
        const signed = pickString(res, [
          "signedTxXdr",
          "signedXdr",
          "xdr",
          "signedTransaction",
        ]);
        if (!signed) {
          throw new Error(
            tr(
              "La cuenta de correo no devolvió la firma.",
              "The email account did not return a signature.",
            ),
          );
        }
        return { signedTxXdr: signed, signerAddress: address ?? undefined };
      }
      const res = await freighterSign(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
        address: opts?.address ?? address ?? undefined,
      });
      if (res.error) {
        throw new Error(
          errorMessage(res.error) ||
            tr("La wallet rechazó la firma.", "The wallet rejected the signature."),
        );
      }
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
    },
    [address, blux, mode],
  );

  const signMessage = useCallback(
    async (message: string) => {
      if (mode === "email") {
        const res = await blux.signMessage(message);
        const sig = pickString(res, ["signedMessage", "signature", "signed"]);
        if (!sig) {
          throw new Error(
            tr(
              "La cuenta de correo no devolvió la firma.",
              "The email account did not return a signature.",
            ),
          );
        }
        return sig;
      }
      const res = await freighterSignMessage(message, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: address ?? undefined,
      });
      if (res.error) {
        throw new Error(
          errorMessage(res.error) ||
            tr("La wallet rechazó la firma.", "The wallet rejected the signature."),
        );
      }
      const sig = res.signedMessage as unknown;
      if (!sig) {
        throw new Error(
          tr("La wallet no devolvió la firma.", "The wallet did not return a signature."),
        );
      }
      if (typeof sig === "string") return sig;
      return Buffer.from(sig as Uint8Array).toString("base64");
    },
    [address, blux, mode],
  );

  const admins = useQuery({
    queryKey: ["admins"],
    queryFn: listAdmins,
    staleTime: 5 * 60_000,
  });
  const isAdmin = Boolean(
    address && admins.data?.some((a) => a.address === address),
  );

  const value = useMemo<WalletState>(
    () => ({
      address,
      mode,
      email,
      googleUser,
      installed,
      wrongNetwork: mode === "wallet" && wrongNetwork,
      connecting,
      isAdmin,
      openAuth,
      connect,
      loginWithEmail,
      loginWithGoogle,
      completeGoogleLogin,
      linkGoogleToAddress,
      logoutGoogle,
      disconnect,
      pickWalletAddress,
      signTransaction,
      signMessage,
    }),
    [
      address,
      mode,
      email,
      googleUser,
      installed,
      wrongNetwork,
      connecting,
      isAdmin,
      openAuth,
      connect,
      loginWithEmail,
      loginWithGoogle,
      completeGoogleLogin,
      linkGoogleToAddress,
      logoutGoogle,
      disconnect,
      pickWalletAddress,
      signTransaction,
      signMessage,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

/** Raíz: Blux por fuera y la wallet de BITAJÓN por dentro. */
export function WalletRoot({ children }: { children: ReactNode }) {
  const network = IS_TESTNET ? networks.testnet : networks.mainnet;
  const config = useMemo(
    () => ({
      appId: BLUX_APP_ID,
      appName: "BITAJÓN",
      networks: [network],
      defaultNetwork: network,
      loginMethods: ["email", "google", "wallet", "passkey"] as const,
      lang: getLang(),
      explorer: "stellarexpert" as const,
      appearance: {
        accentColor: "#01417E",
        borderRadius: "16px",
        fontFamily: "var(--font-sans)",
        logo: "/brand/mark.png",
      },
    }),
    [network],
  );

  return (
    <BluxProvider config={config as never}>
      <WalletProvider>{children}</WalletProvider>
    </BluxProvider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet debe usarse dentro de <WalletProvider>");
  }
  return ctx;
}
