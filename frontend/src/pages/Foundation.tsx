import { Buffer } from "buffer";
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CircleSlash,
  Clock3,
  ExternalLink,
  FileUp,
  ImageIcon,
  Link2,
  Lock,
  Mail,
  Pencil,
  Plus,
  Rocket,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EvidenceUpload } from "../components/EvidenceUpload";
import { CoverPicker, GalleryPicker } from "../components/ImagePicker";
import { NonprofitLogo, SocialFields, SocialLinks } from "../components/Nonprofit";
import { RequireWallet } from "../components/RequireWallet";
import { AddressLink, CopyButton, EmptyState, ErrorBox, PageHeader, ProgressBar, Spinner, StageBadge } from "../components/ui";
import { MILESTONE_MAX, MILESTONE_MIN, MILESTONE_RECOMMENDED, TOKEN_SYMBOL } from "../config";
import { useBalance, useCampaignMetaMap, useCampaigns, useNonprofitMeta, useProfile, useTeamInfo } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { Money, useFiatValue } from "../lib/currency";
import { friendlyError } from "../lib/errors";
import { formatToken, parseAmount, percent, shortAddress, timeLeftLabel } from "../lib/format";
import { sha256File, toHex } from "../lib/hash";
import { sendXlm, spendableBalance } from "../lib/horizon";
import { tr } from "../lib/i18n";
import {
  BUCKETS,
  publicUrl,
  saveCampaignMedia,
  saveNonprofitProfile,
  savePrivate,
  saveRut,
  type CampaignMeta,
  type NonprofitMeta,
  type Socials,
} from "../lib/offchain";
import { milestoneOf, raised, stageOf } from "../lib/status";
import { cancelCampaign, createCampaign, createVault, registerNonprofit, type CampaignView, type NonprofitProfile } from "../lib/stellar";
import { useWallet } from "../lib/wallet";

/** SHA-256 del correo en minúsculas: es lo que queda en la cadena (el correo real va a Supabase). */
async function emailHash(email: string): Promise<Buffer> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  return Buffer.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export function Foundation() {
  return (
    <>
      <PageHeader eyebrow={tr("Para fundaciones", "For nonprofits")} title={tr("Panel de tu fundación", "Your nonprofit dashboard")}>
        {tr(
          "Registra tu fundación con tu correo, publica campañas con fotos y sube la evidencia que libera los fondos.",
          "Register your nonprofit with your email, publish campaigns with photos and upload the evidence that releases the funds.",
        )}
      </PageHeader>
      <section className="container-page py-10">
        <RequireWallet
          allowEmail
          title={tr("Entra con el correo de tu fundación", "Sign in with your nonprofit's email")}
          text={tr(
            "Te enviamos un código y se crea la cuenta de la fundación en Stellar. Usa siempre el mismo correo: esa cuenta es la identidad de la fundación en BITAJÓN.",
            "We send you a code and your nonprofit's Stellar account is created. Always use the same email: that account is your nonprofit's identity on BITAJÓN.",
          )}
        >
          <FoundationInner />
        </RequireWallet>
      </section>
    </>
  );
}

function FoundationInner() {
  const { address } = useWallet();
  const profile = useProfile(address);

  if (profile.isLoading)
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  if (profile.isError) return <ErrorBox error={profile.error} onRetry={() => profile.refetch()} />;
  if (!profile.data) return <RegisterForm />;

  const status = profile.data.status.tag;
  if (status === "Pending") return <PendingCard profile={profile.data} address={address!} />;
  if (status === "Revoked")
    return (
      <EmptyState icon={<CircleSlash className="h-6 w-6" />} title={tr("Tu fundación fue revocada", "Your nonprofit was revoked")}>
        {tr(
          `El administrador revocó el registro de ${profile.data.legal_name}. No puedes crear campañas nuevas. Escríbele al equipo de BITAJÓN si crees que es un error.`,
          `The admin revoked ${profile.data.legal_name}'s registration. You can't create new campaigns. Contact the BITAJÓN team if you think this is a mistake.`,
        )}
      </EmptyState>
    );
  return <Dashboard profile={profile.data} address={address!} />;
}

/* ------------------------------------------------------------------ */
/* Registro                                                            */
/* ------------------------------------------------------------------ */

function RegisterForm() {
  const { mode, email: loginEmail } = useWallet();
  const { run, pending } = useTx();
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState(loginEmail && loginEmail.includes("@") ? loginEmail : "");
  const [description, setDescription] = useState("");
  const [socials, setSocials] = useState<Socials>({});
  const [logo, setLogo] = useState<File | null>(null);
  const [rut, setRut] = useState<{ file: File; hash: Buffer } | null>(null);
  const [retention, setRetention] = useState(false);
  const [consent, setConsent] = useState(false);

  const valid = legalName.trim().length >= 3 && /^[\d.\-\s]{5,}$/.test(taxId.trim()) && /\S+@\S+\.\S+/.test(email) && rut && consent;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <form
        className="card p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || !rut) return;
          void run(
            async (s) => {
              // 1. Registro on-chain: quedan la huella del RUT y la del correo (no el correo).
              const tx = await registerNonprofit(s, {
                legalName: legalName.trim(),
                taxId: taxId.trim(),
                emailHash: await emailHash(email),
                rutHash: rut.hash,
                retentionCertificate: retention,
                dataConsent: consent,
              });
              // 2. RUT y correo al almacenamiento privado (solo los admins) y perfil público.
              await saveRut(s, rut.file);
              await savePrivate(s, { email: email.trim().toLowerCase() });
              await saveNonprofitProfile(s, { display_name: legalName.trim(), description, ...socials, logo, login_method: mode ?? undefined });
              return tx;
            },
            { loading: tr("Registrando tu fundación…", "Registering your nonprofit…"), success: tr("Registro enviado. Queda pendiente de aprobación.", "Registration sent. Pending approval.") },
          );
        }}
      >
        <h2 className="text-2xl font-semibold">{tr("Registra tu fundación", "Register your nonprofit")}</h2>
        <p className="mt-1 text-sm text-slate-600">{tr("El equipo de BITAJÓN revisa los datos y el RUT, y aprueba la fundación.", "The BITAJÓN team reviews the details and the RUT, and approves the nonprofit.")}</p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="label">{tr("Razón social", "Legal name")}</span>
            <input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Fundación Amigos Samaritanos" required />
          </label>
          <label>
            <span className="label">{tr("NIT", "Tax ID (NIT)")}</span>
            <input className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="900.123.456-7" inputMode="numeric" required />
          </label>
          <label>
            <span className="label inline-flex items-center gap-1.5">
              {tr("Correo de contacto", "Contact email")} <Lock className="h-3.5 w-3.5 text-slate-400" />
            </span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contacto@fundacion.org" required />
          </label>
          <div className="sm:col-span-2">
            <span className="label inline-flex items-center gap-1.5">
              {tr("RUT (PDF o foto)", "RUT (PDF or photo)")} <Lock className="h-3.5 w-3.5 text-slate-400" />
            </span>
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-4 text-sm font-semibold text-brand-800 hover:border-leaf-400 hover:bg-leaf-50">
              <FileUp className="h-4 w-4" /> {rut ? rut.file.name : tr("Elegir archivo del RUT", "Choose the RUT file")}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f && f.size <= 5 * 1048576) setRut({ file: f, hash: await sha256File(f) });
                }}
              />
            </label>
            <p className="hint">
              {tr(
                `Privado: solo los admins de BITAJÓN pueden abrirlo. En la red queda su huella (${rut ? `${toHex(rut.hash).slice(0, 16)}…` : "SHA-256"}). Máx. 5 MB.`,
                `Private: only BITAJÓN admins can open it. Only its fingerprint goes on the network (${rut ? `${toHex(rut.hash).slice(0, 16)}…` : "SHA-256"}). Max 5 MB.`,
              )}
            </p>
          </div>
        </div>

        <h3 className="mt-8 text-lg font-semibold">{tr("Perfil público", "Public profile")}</h3>
        <p className="text-sm text-slate-600">{tr("Esto lo ven los donantes en cada campaña. Puedes editarlo después.", "Donors see this on every campaign. You can edit it later.")}</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr]">
          <LogoField file={logo} onChange={setLogo} name={legalName || tr("Fundación", "Nonprofit")} />
          <label>
            <span className="label">{tr("Quiénes son y qué hacen", "Who you are and what you do")}</span>
            <textarea
              className="input min-h-28"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1200}
              placeholder={tr(
                "Atendemos a 30 niños y niñas en Patio Bonito con comedor comunitario y jornada educativa alterna…",
                "We serve 30 children in Patio Bonito with a community kitchen and after-school program…",
              )}
            />
          </label>
        </div>
        <div className="mt-5">
          <SocialFields value={socials} onChange={setSocials} />
        </div>

        <div className="mt-6 space-y-3">
          <Checkbox checked={retention} onChange={setRetention} label={tr("La fundación cuenta con certificado de retención", "The nonprofit has a tax retention certificate")} />
          <Checkbox
            checked={consent}
            onChange={setConsent}
            label={tr("Autorizo el tratamiento de los datos de la fundación (Habeas Data, Ley 1581 de 2012)", "I authorize the processing of the nonprofit's data (Colombian Habeas Data law 1581 of 2012)")}
          />
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-xs text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          {tr(
            "La razón social y el NIT quedan públicos en la red. El correo y el RUT se guardan en privado (en la red solo queda su huella). No pongas datos personales de beneficiarios ni de menores.",
            "The legal name and tax ID are public on the network. The email and RUT are stored privately (only their fingerprint goes on-chain). Don't include personal data of beneficiaries or minors.",
          )}
        </div>

        <button type="submit" className="btn-primary mt-6 w-full !py-3" disabled={!valid || pending}>
          {pending ? <Spinner className="h-4 w-4" /> : <Building2 className="h-4 w-4" />} {tr("Enviar registro", "Submit registration")}
        </button>
        <p className="hint text-center">
          {mode === "email"
            ? tr("Firmamos con tu cuenta de correo: no tienes que instalar nada.", "We sign with your email account: nothing to install.")
            : tr("Tu wallet te pedirá dos firmas: el registro en el contrato y la subida del RUT y el perfil.", "Your wallet will ask for two signatures: the contract registration and the RUT/profile upload.")}
        </p>
      </form>

      <aside className="space-y-4">
        <div className="card p-6">
          <h3 className="text-lg font-semibold">{tr("¿Qué pasa después?", "What happens next?")}</h3>
          <ol className="mt-4 space-y-4 text-sm text-slate-600">
            <li>
              <b className="text-brand-900">{tr("1. Revisión.", "1. Review.")}</b> {tr("El equipo revisa tu RUT y aprueba la fundación.", "The team reviews your RUT and approves the nonprofit.")}
            </li>
            <li>
              <b className="text-brand-900">{tr("2. Campañas.", "2. Campaigns.")}</b>{" "}
              {tr("Publicas campañas con fotos, meta y fecha. Cada una abre su bóveda.", "You publish campaigns with photos, a goal and a deadline. Each one opens its vault.")}
            </li>
            <li>
              <b className="text-brand-900">{tr("3. Primer desembolso.", "3. First payout.")}</b>{" "}
              {tr(
                `Al llegar a la meta recibes automáticamente el porcentaje que elijas (entre ${MILESTONE_MIN}% y ${MILESTONE_MAX}%).`,
                `When the goal is reached you automatically receive the percentage you choose (between ${MILESTONE_MIN}% and ${MILESTONE_MAX}%).`,
              )}
            </li>
            <li>
              <b className="text-brand-900">{tr("4. Evidencia.", "4. Evidence.")}</b> {tr("Publicas fotos y facturas, y se libera el resto.", "You publish photos and invoices, and the rest is released.")}
            </li>
            <li>
              <b className="text-brand-900">{tr("5. Retiro.", "5. Withdrawal.")}</b>{" "}
              {tr("Si entraste con correo, puedes vincular tu wallet y enviarte los fondos cuando quieras.", "If you signed in with email, you can link your wallet and send the funds to it whenever you want.")}
            </li>
          </ol>
        </div>
      </aside>
    </div>
  );
}

function LogoField({ file, onChange, existing, name }: { file: File | null; onChange: (f: File | null) => void; existing?: string | null; name: string }) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  return (
    <div>
      <span className="label">Logo</span>
      <label className="block cursor-pointer" title={tr("Cambiar logo", "Change logo")}>
        {preview ? (
          <img src={preview} alt="" className="h-24 w-24 rounded-2xl bg-white object-contain ring-1 ring-slate-200" />
        ) : existing ? (
          <NonprofitLogo path={existing} name={name} size="h-24 w-24" />
        ) : (
          <span className="grid h-24 w-24 place-items-center rounded-2xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-leaf-400">
            <ImageIcon className="h-6 w-6" />
          </span>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-leaf-600" />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Perfil público (editar)                                              */
/* ------------------------------------------------------------------ */

/** `target`: si lo usa un admin para editar otra fundación (sin la opción del RUT). */
export function ProfileEditor({
  profile,
  meta,
  onDone,
  target,
}: {
  profile: NonprofitProfile;
  meta: NonprofitMeta | null | undefined;
  onDone?: () => void;
  target?: string;
}) {
  const { run, pending } = useTx();
  const [displayName, setDisplayName] = useState(meta?.display_name ?? profile.legal_name);
  const [description, setDescription] = useState(meta?.description ?? "");
  const [socials, setSocials] = useState<Socials>({
    website: meta?.website,
    instagram: meta?.instagram,
    facebook: meta?.facebook,
    tiktok: meta?.tiktok,
    x: meta?.x,
    whatsapp: meta?.whatsapp,
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [rut, setRut] = useState<File | null>(null);

  return (
    <div className="card animate-rise p-6 sm:p-8">
      <h3 className="text-xl font-semibold">{tr("Perfil público de la fundación", "Nonprofit public profile")}</h3>
      <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr]">
        <LogoField file={logo} onChange={setLogo} existing={meta?.logo_path} name={displayName} />
        <div className="space-y-4">
          <label className="block">
            <span className="label">{tr("Nombre para mostrar", "Display name")}</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} />
          </label>
          <label className="block">
            <span className="label">{tr("Quiénes son y qué hacen", "Who you are and what you do")}</span>
            <textarea className="input min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1200} />
          </label>
        </div>
      </div>
      <div className="mt-5">
        <SocialFields value={socials} onChange={setSocials} />
      </div>
      {!target && (
        <div className="mt-5">
          <span className="label inline-flex items-center gap-1.5">
            {tr("Volver a subir el RUT (opcional)", "Re-upload the RUT (optional)")} <Lock className="h-3.5 w-3.5 text-slate-400" />
          </span>
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-brand-800 hover:border-leaf-400">
            <FileUp className="h-4 w-4" /> {rut ? rut.name : tr("Elegir archivo", "Choose file")}
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => setRut(e.target.files?.[0] ?? null)} />
          </label>
          <p className="hint">
            {tr(
              "Úsalo si el RUT no se subió en el registro. Debe ser el mismo archivo: el admin compara su huella con la registrada en la red.",
              "Use it if the RUT wasn't uploaded during registration. It must be the same file: the admin compares its fingerprint with the one on the network.",
            )}
          </p>
        </div>
      )}
      <button
        type="button"
        className="btn-primary mt-6"
        disabled={pending}
        onClick={() =>
          run(
            async (s) => {
              if (rut) await saveRut(s, rut);
              await saveNonprofitProfile(s, { display_name: displayName, description, ...socials, logo, keepLogo: meta?.logo_path ?? null }, target);
              return { result: null, hash: "" };
            },
            { loading: tr("Guardando el perfil…", "Saving the profile…"), success: tr("Perfil actualizado.", "Profile updated.") },
          ).then((r) => r && onDone?.())
        }
      >
        {pending && <Spinner className="h-4 w-4" />} {tr("Guardar perfil", "Save profile")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PendingCard({ profile, address }: { profile: NonprofitProfile; address: string }) {
  const meta = useNonprofitMeta(address);
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-6">
      <div className="card mx-auto max-w-2xl p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <Clock3 className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold">{tr(`${profile.legal_name} está en revisión`, `${profile.legal_name} is under review`)}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {tr(
            "Recibimos tu registro. Cuando un admin lo apruebe podrás publicar campañas desde aquí. Para agilizarlo, comparte esta dirección con el equipo:",
            "We received your registration. Once an admin approves it you'll be able to publish campaigns here. To speed it up, share this address with the team:",
          )}
        </p>
        <div className="mx-auto mt-4 flex max-w-md items-center gap-1 rounded-xl bg-sand p-3 ring-1 ring-slate-200">
          <code className="flex-1 font-mono text-xs break-all text-brand-900">{address}</code>
          <CopyButton value={address} />
        </div>
        <dl className="mx-auto mt-6 grid max-w-md gap-2 text-left text-sm">
          <Row k={tr("NIT", "Tax ID")} v={profile.tax_id} />
          <Row k={tr("Correo", "Email")} v={tr("Guardado en privado", "Stored privately")} />
          <Row k={tr("Certificado de retención", "Retention certificate")} v={profile.retention_certificate ? tr("Sí", "Yes") : "No"} />
        </dl>
        {!meta.isLoading && !meta.data && (
          <p className="mx-auto mt-6 max-w-md rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            {tr("Falta completar el perfil público y subir el RUT para que el admin pueda revisarlo.", "Complete the public profile and upload the RUT so the admin can review it.")}
          </p>
        )}
        <button type="button" className="btn-outline mt-6" onClick={() => setEditing((e) => !e)}>
          <Pencil className="h-4 w-4" /> {editing ? tr("Cerrar", "Close") : meta.data ? tr("Editar perfil", "Edit profile") : tr("Completar perfil y RUT", "Complete profile and RUT")}
        </button>
      </div>
      {editing && <ProfileEditor profile={profile} meta={meta.data} onDone={() => setEditing(false)} />}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200/70">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-brand-900">{v}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Wallet de retiro (para quien entra con correo)                       */
/* ------------------------------------------------------------------ */

const payoutKey = (address: string) => `bitajon.payout.${address}`;

function readPayout(address: string): string {
  try {
    return localStorage.getItem(payoutKey(address)) ?? "";
  } catch {
    return "";
  }
}

/**
 * Una fundación que entró con correo puede vincular su propia wallet (Varial) y enviarse
 * los fondos liberados. La cuenta de la fundación en los contratos sigue siendo la de correo.
 */
function PayoutWallet({ address }: { address: string }) {
  const { mode, pickWalletAddress } = useWallet();
  const { run, pending } = useTx();
  const balance = useBalance(address);
  const toFiat = useFiatValue();
  const [payout, setPayout] = useState(() => readPayout(address));
  const [manual, setManual] = useState("");
  const [spendable, setSpendable] = useState<bigint | null>(null);

  useEffect(() => {
    void spendableBalance(address).then(setSpendable);
  }, [address, balance.data]);

  async function save(w: string) {
    const r = await run(
      async (s) => {
        await savePrivate(s, { payout_wallet: w || null });
        return { result: null, hash: "" };
      },
      { loading: tr("Guardando tu wallet…", "Saving your wallet…"), success: w ? tr("Wallet vinculada.", "Wallet linked.") : tr("Wallet desvinculada.", "Wallet unlinked.") },
    );
    if (r) {
      try {
        if (w) localStorage.setItem(payoutKey(address), w);
        else localStorage.removeItem(payoutKey(address));
      } catch {
        /* sin almacenamiento */
      }
      setPayout(w);
      setManual("");
    }
  }

  if (mode !== "email") return null;

  return (
    <div className="card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="h-5 w-5 text-leaf-600" /> {tr("Tu wallet para retirar fondos", "Your wallet to withdraw funds")}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            {tr(
              "Los fondos que liberan tus campañas llegan a la cuenta de tu correo. Vincula tu wallet (Varial) para enviártelos cuando quieras.",
              "The funds your campaigns release arrive in your email account. Link your wallet (Varial) to send them to yourself whenever you want.",
            )}
          </p>
        </div>
        <div className="rounded-2xl bg-sand px-4 py-3 text-right">
          <p className="text-xs font-semibold text-slate-500 uppercase">{tr("Saldo en tu cuenta", "Balance in your account")}</p>
          {balance.data != null ? <Money units={balance.data} className="font-display text-xl font-semibold text-brand-900" /> : <p className="text-sm">—</p>}
        </div>
      </div>

      {payout ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-leaf-50 p-3 text-sm">
            <span className="inline-flex items-center gap-2 text-leaf-900">
              <Link2 className="h-4 w-4" /> {tr("Vinculada:", "Linked:")} <AddressLink address={payout} chars={6} />
            </span>
            <button type="button" className="text-xs font-semibold text-rose-700 hover:underline" disabled={pending} onClick={() => save("")}>
              {tr("Desvincular", "Unlink")}
            </button>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !spendable || spendable <= 0n}
            onClick={() => {
              if (!spendable || spendable <= 0n) return;
              const msg = tr(
                `¿Enviar ${formatToken(spendable)}${toFiat(spendable) ? ` (≈ ${toFiat(spendable)})` : ""} a ${shortAddress(payout, 6)}?`,
                `Send ${formatToken(spendable)}${toFiat(spendable) ? ` (≈ ${toFiat(spendable)})` : ""} to ${shortAddress(payout, 6)}?`,
              );
              if (!window.confirm(msg)) return;
              void run((s) => sendXlm(s, payout, spendable), { loading: tr("Enviando los fondos…", "Sending the funds…"), success: tr("Fondos enviados a tu wallet.", "Funds sent to your wallet.") });
            }}
          >
            {pending ? <Spinner className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}{" "}
            {spendable && spendable > 0n ? tr(`Enviar ${formatToken(spendable)} a mi wallet`, `Send ${formatToken(spendable)} to my wallet`) : tr("Sin saldo disponible para enviar", "No balance available to send")}
          </button>
          <p className="hint">{tr("Se deja un pequeño saldo en la cuenta porque la red lo exige para mantenerla activa.", "A small balance stays in the account because the network requires it to keep it active.")}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <button
            type="button"
            className="btn-navy"
            disabled={pending}
            onClick={async () => {
              try {
                const w = await pickWalletAddress();
                if (w === address) return toast.error(tr("Esa es la misma cuenta de tu correo.", "That's the same account as your email."));
                await save(w);
              } catch (e) {
                toast.error(friendlyError(e));
              }
            }}
          >
            <Wallet className="h-4 w-4" /> {tr("Conectar Varial", "Connect Varial")}
          </button>
          <label className="block">
            <span className="label">{tr("o pega la dirección de tu wallet (G…)", "or paste your wallet address (G…)")}</span>
            <input className="input font-mono text-xs" value={manual} onChange={(e) => setManual(e.target.value.trim())} placeholder="G…" />
          </label>
          <button type="button" className="btn-outline" disabled={pending || !/^G[A-Z2-7]{55}$/.test(manual)} onClick={() => save(manual)}>
            {tr("Guardar", "Save")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel de la fundación aprobada                                       */
/* ------------------------------------------------------------------ */

function Dashboard({ profile, address }: { profile: NonprofitProfile; address: string }) {
  const { mode, email } = useWallet();
  const campaigns = useCampaigns();
  const meta = useNonprofitMeta(address);
  const [creating, setCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const mine = useMemo(
    () => (campaigns.data ?? []).filter((v) => v.campaign.nonprofit === address).sort((a, b) => Number(b.id - a.id)),
    [campaigns.data, address],
  );
  const name = meta.data?.display_name || profile.legal_name;

  return (
    <div className="space-y-8">
      <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <NonprofitLogo path={meta.data?.logo_path} name={name} />
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf-700">
              <BadgeCheck className="h-4 w-4" /> {tr("Fundación aprobada", "Approved nonprofit")}
            </p>
            <h2 className="mt-0.5 text-2xl font-semibold">{name}</h2>
            <p className="text-sm text-slate-500">
              NIT {profile.tax_id}
              {mode === "email" && email && (
                <span className="ml-2 inline-flex items-center gap-1">
                  · <Mail className="h-3.5 w-3.5" /> {email}
                </span>
              )}
            </p>
            {meta.data && <SocialLinks socials={meta.data} className="mt-2" />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={() => setEditingProfile((e) => !e)}>
            <Pencil className="h-4 w-4" /> {tr("Perfil y redes", "Profile and socials")}
          </button>
          <button type="button" className="btn-primary" onClick={() => setCreating((c) => !c)}>
            {creating ? <XCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {creating ? tr("Cerrar", "Close") : tr("Nueva campaña", "New campaign")}
          </button>
        </div>
      </div>

      {editingProfile && <ProfileEditor profile={profile} meta={meta.data} onDone={() => setEditingProfile(false)} />}
      {creating && <CreateCampaign onDone={() => setCreating(false)} />}

      <PayoutWallet address={address} />

      <div>
        <h3 className="text-xl font-semibold">{tr("Tus campañas", "Your campaigns")}</h3>
        <div className="mt-4 space-y-4">
          {campaigns.isLoading ? (
            <Spinner className="h-6 w-6 text-brand-600" />
          ) : mine.length === 0 ? (
            <EmptyState
              icon={<Rocket className="h-6 w-6" />}
              title={tr("Aún no tienes campañas", "You don't have campaigns yet")}
              action={
                !creating && (
                  <button className="btn-primary" onClick={() => setCreating(true)}>
                    {tr("Crear la primera", "Create the first one")}
                  </button>
                )
              }
            >
              {tr("Crea una campaña con un fin concreto: kits escolares, Navidad, la fiesta del niño.", "Create a campaign with a clear purpose: school kits, Christmas, Children's Day.")}
            </EmptyState>
          ) : (
            mine.map((v) => <OwnCampaign key={v.id.toString()} view={v} />)
          )}
        </div>
      </div>
    </div>
  );
}

function CreateCampaign({ onDone }: { onDone: () => void }) {
  const { run, pending } = useTx();
  const team = useTeamInfo();
  const toFiat = useFiatValue();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [milestone, setMilestone] = useState(MILESTONE_RECOMMENDED);
  const [cover, setCover] = useState<File | null>(null);
  const [gallery, setGallery] = useState<File[]>([]);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);

  const targetUnits = parseAmount(target);
  const deadlineSec = deadline ? BigInt(Math.floor(new Date(`${deadline}T23:59:59`).getTime() / 1000)) : null;
  const minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const valid =
    name.trim().length >= 4 &&
    description.trim().length >= 20 &&
    location.trim() &&
    targetUnits &&
    targetUnits > 0n &&
    deadlineSec &&
    Number(deadlineSec) * 1000 > Date.now() &&
    milestone >= MILESTONE_MIN &&
    milestone <= MILESTONE_MAX &&
    Boolean(team.data?.address);

  async function submit() {
    if (!valid || !targetUnits || !deadlineSec || !team.data) return;
    const verifier = team.data.address;
    setStep(1);
    const created = await run(
      (s) =>
        createCampaign(s, {
          name: name.trim(),
          description: description.trim(),
          location: location.trim(),
          targetAmount: targetUnits,
          deadline: deadlineSec,
          milestonePercentage: milestone,
        }),
      { loading: tr("Paso 1: creando la campaña…", "Step 1: creating the campaign…"), success: tr("Campaña creada.", "Campaign created.") },
    );
    if (!created) return setStep(0);
    const id = BigInt(created.result);
    setStep(2);
    const vault = await run(
      (s) => createVault(s, id, verifier),
      { loading: tr("Paso 2: abriendo la bóveda…", "Step 2: opening the vault…"), success: tr("La campaña ya recibe donaciones.", "The campaign is now accepting donations.") },
      { campaignId: id },
    );
    if (cover || gallery.length) {
      setStep(3);
      await run(
        async (s) => {
          await saveCampaignMedia(s, id, { cover, gallery });
          return { result: null, hash: "" };
        },
        { loading: tr("Paso 3: subiendo las fotos…", "Step 3: uploading the photos…"), success: tr("Fotos publicadas.", "Photos published.") },
        { campaignId: id },
      );
    }
    setStep(0);
    if (vault) onDone();
  }

  const first = targetUnits ? (targetUnits * BigInt(milestone)) / 100n : null;

  return (
    <div className="card animate-rise p-6 sm:p-8">
      <h3 className="text-xl font-semibold">{tr("Nueva campaña", "New campaign")}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {tr(
          "Se firma la creación de la campaña, la apertura de su bóveda y, si agregas fotos, su subida.",
          "You'll sign the campaign creation, the vault opening and, if you add photos, their upload.",
        )}
      </p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">{tr("Nombre", "Name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Kits escolares 2027 para Patio Bonito", "2027 school kits for Patio Bonito")} maxLength={80} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">{tr("Descripción", "Description")}</span>
          <textarea
            className="input min-h-32"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tr("Qué se va a entregar, a cuántos niños y niñas, cuándo y cómo lo van a demostrar.", "What will be delivered, to how many children, when and how you'll prove it.")}
            maxLength={1000}
          />
          <p className="hint">{tr(`${description.length}/1000 · mínimo 20 caracteres`, `${description.length}/1000 · at least 20 characters`)}</p>
        </label>
        <div className="grid gap-5 sm:col-span-2 lg:grid-cols-2">
          <CoverPicker file={cover} onChange={setCover} />
          <GalleryPicker files={gallery} onChange={setGallery} />
        </div>
        <label>
          <span className="label">{tr("Lugar", "Place")}</span>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Patio Bonito, Bogotá" />
        </label>
        <label>
          <span className="label">{tr(`Meta en ${TOKEN_SYMBOL}`, `Goal in ${TOKEN_SYMBOL}`)}</span>
          <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1000" />
          <p className="hint">
            {targetUnits && toFiat(targetUnits) ? `≈ ${toFiat(targetUnits)} · ` : ""}
            {tr("Es lo que debe llegar a la bóveda (neto, después de la comisión).", "It's what must reach the vault (net, after fees).")}
          </p>
        </label>
        <label>
          <span className="label">{tr("Fecha límite", "Deadline")}</span>
          <input className="input" type="date" min={minDate} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <div className="rounded-2xl bg-sand p-4 text-sm text-slate-600 sm:col-span-2">
          <label className="block">
            <span className="label flex items-center justify-between">
              <span>{tr("Primer desembolso al llegar a la meta", "First payout when the goal is reached")}</span>
              <span className="font-display text-lg text-brand-900">{milestone}%</span>
            </span>
            <input
              type="range"
              min={MILESTONE_MIN}
              max={MILESTONE_MAX}
              value={milestone}
              onChange={(e) => setMilestone(Number(e.target.value))}
              className="w-full accent-leaf-600"
            />
          </label>
          <p className="mt-2">
            {tr(
              `Con ${milestone}%, recibes ${first ? formatToken(first) : `el ${milestone}% de la meta`} al llegar a la meta y el ${100 - milestone}% restante cuando el verificador valida tu evidencia. Máximo ${MILESTONE_MAX}%: al menos el ${100 - MILESTONE_MAX}% siempre queda atado a la evidencia. Sugerimos ${MILESTONE_RECOMMENDED}%.`,
              `With ${milestone}%, you get ${first ? formatToken(first) : `${milestone}% of the goal`} when the goal is reached and the remaining ${100 - milestone}% once the verifier validates your evidence. Maximum ${MILESTONE_MAX}%: at least ${100 - MILESTONE_MAX}% is always tied to evidence. We suggest ${MILESTONE_RECOMMENDED}%.`,
            )}
          </p>
          {team.isError && <p className="mt-2 text-xs text-rose-700">{tr("No se pudo cargar la cuenta verificadora de BITAJÓN. Recarga la página.", "Could not load the BITAJÓN verifier account. Reload the page.")}</p>}
        </div>
      </div>
      <button type="button" className="btn-primary mt-6 w-full !py-3 sm:w-auto" disabled={!valid || pending} onClick={submit}>
        {pending && <Spinner className="h-4 w-4" />}
        {step === 1
          ? tr("Creando campaña (1/3)…", "Creating campaign (1/3)…")
          : step === 2
            ? tr("Abriendo bóveda (2/3)…", "Opening vault (2/3)…")
            : step === 3
              ? tr("Subiendo fotos (3/3)…", "Uploading photos (3/3)…")
              : tr("Publicar campaña", "Publish campaign")}
      </button>
    </div>
  );
}

export function MediaEditor({ campaignId, meta, onDone }: { campaignId: bigint; meta: CampaignMeta | undefined; onDone: () => void }) {
  const { run, pending } = useTx();
  const [cover, setCover] = useState<File | null>(null);
  const [keepCover, setKeepCover] = useState<string | null>(meta?.cover_path ?? null);
  const [gallery, setGallery] = useState<File[]>([]);
  const [keepGallery, setKeepGallery] = useState<string[]>(meta?.gallery ?? []);

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-sand p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <CoverPicker file={cover} onChange={setCover} existing={publicUrl(BUCKETS.media, keepCover)} onRemoveExisting={() => setKeepCover(null)} />
        <GalleryPicker
          files={gallery}
          onChange={setGallery}
          existing={keepGallery.map((p) => ({ path: p, url: publicUrl(BUCKETS.media, p)! }))}
          onRemoveExisting={(p) => setKeepGallery(keepGallery.filter((x) => x !== p))}
        />
      </div>
      <button
        type="button"
        className="btn-primary mt-4"
        disabled={pending}
        onClick={() =>
          run(
            async (s) => {
              await saveCampaignMedia(s, campaignId, { cover, keepCover, gallery, keepGallery });
              return { result: null, hash: "" };
            },
            { loading: tr("Guardando las fotos…", "Saving the photos…"), success: tr("Fotos actualizadas.", "Photos updated.") },
            { campaignId },
          ).then((r) => r && onDone())
        }
      >
        {pending && <Spinner className="h-4 w-4" />} {tr("Guardar fotos", "Save photos")}
      </button>
    </div>
  );
}

function OwnCampaign({ view }: { view: CampaignView }) {
  const { run, pending } = useTx();
  const team = useTeamInfo();
  const metaMap = useCampaignMetaMap();
  const [editingMedia, setEditingMedia] = useState(false);
  const stage = stageOf(view);
  const m = milestoneOf(view);
  const pct = percent(raised(view), view.campaign.target_amount);
  const meta = metaMap.data?.get(view.id.toString());
  const cover = publicUrl(BUCKETS.media, meta?.cover_path);

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          {cover ? (
            <img src={cover} alt="" className="hidden h-16 w-24 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 sm:block" />
          ) : (
            <span className="hidden h-16 w-24 shrink-0 place-items-center rounded-xl bg-sand text-slate-400 ring-1 ring-slate-200 sm:grid">
              <ImageIcon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StageBadge stage={stage} milestone={m} />
              <span className="text-xs text-slate-400">
                #{view.id.toString()} · {tr(`${m}% al llegar a la meta`, `${m}% at goal`)}
              </span>
            </div>
            <Link to={`/campanas/${view.id.toString()}`} className="mt-2 inline-flex items-center gap-1.5 text-lg font-semibold text-brand-900 hover:text-brand-700">
              {view.campaign.name} <ExternalLink className="h-4 w-4" />
            </Link>
            <p className="text-sm text-slate-500">
              <Money units={raised(view)} inline /> {tr("de", "of")} {formatToken(view.campaign.target_amount)} · {timeLeftLabel(view.campaign.deadline)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {stage !== "cancelled" && (
            <button type="button" className="btn-outline" onClick={() => setEditingMedia((e) => !e)}>
              <ImageIcon className="h-4 w-4" /> {editingMedia ? tr("Cerrar", "Close") : tr("Fotos", "Photos")}
            </button>
          )}
          {stage === "draft" && (
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !team.data}
              onClick={() =>
                team.data &&
                run(
                  (s) => createVault(s, view.id, team.data!.address),
                  { loading: tr("Abriendo la bóveda…", "Opening the vault…"), success: tr("Bóveda abierta: ya recibe donaciones.", "Vault opened: now accepting donations.") },
                  { campaignId: view.id },
                )
              }
            >
              {tr("Abrir bóveda", "Open vault")}
            </button>
          )}
          {(stage === "draft" || stage === "active") && (
            <button
              type="button"
              className="btn-outline !text-rose-700"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(tr("¿Cancelar esta campaña? Esta acción no se puede deshacer y los donantes podrán pedir su reembolso.", "Cancel this campaign? This can't be undone and donors will be able to claim refunds.")))
                  return;
                void run((s) => cancelCampaign(s, view.id), { loading: tr("Cancelando la campaña…", "Cancelling the campaign…"), success: tr("Campaña cancelada.", "Campaign cancelled.") }, { campaignId: view.id });
              }}
            >
              {tr("Cancelar", "Cancel")}
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <ProgressBar value={pct} size="sm" />
      </div>
      {editingMedia && <MediaEditor campaignId={view.id} meta={meta} onDone={() => setEditingMedia(false)} />}
      {stage === "funded" && (
        <div className="mt-5">
          <EvidenceUpload campaignId={view.id} />
        </div>
      )}
      {stage === "review" && (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-slate-600">{tr("Evidencia publicada. Esperando la validación del verificador.", "Evidence published. Waiting for the verifier's validation.")}</p>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">{tr("¿Te equivocaste de archivo? Reemplázala", "Wrong file? Replace it")}</summary>
            <div className="mt-3">
              <EvidenceUpload campaignId={view.id} replacing />
            </div>
          </details>
        </div>
      )}
      {stage === "paused" && (
        <p className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
          {tr("Un admin pausó esta campaña. Escríbele al equipo de BITAJÓN para saber qué revisar.", "An admin paused this campaign. Contact the BITAJÓN team to find out what to review.")}
        </p>
      )}
    </div>
  );
}
