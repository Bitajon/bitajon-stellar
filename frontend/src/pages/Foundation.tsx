import { Buffer } from "buffer";
import { BadgeCheck, Building2, CircleSlash, Clock3, ExternalLink, FileUp, ImageIcon, Lock, Pencil, Plus, Rocket, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EvidenceUpload } from "../components/EvidenceUpload";
import { CoverPicker, GalleryPicker } from "../components/ImagePicker";
import { NonprofitLogo, SocialFields, SocialLinks } from "../components/Nonprofit";
import { RequireWallet } from "../components/RequireWallet";
import { CopyButton, EmptyState, ErrorBox, PageHeader, ProgressBar, Spinner, StageBadge } from "../components/ui";
import { MILESTONE_PERCENTAGE, TOKEN_SYMBOL } from "../config";
import { useCampaignMetaMap, useCampaigns, useNonprofitMeta, useProfile } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { formatToken, parseAmount, percent, timeLeftLabel } from "../lib/format";
import { sha256File, toHex } from "../lib/hash";
import { BUCKETS, publicUrl, saveCampaignMedia, saveNonprofitProfile, saveRut, type CampaignMeta, type NonprofitMeta, type Socials } from "../lib/offchain";
import { raised, stageOf } from "../lib/status";
import { cancelCampaign, createCampaign, createVault, registerNonprofit, type CampaignView, type NonprofitProfile } from "../lib/stellar";
import { useWallet } from "../lib/wallet";

export function Foundation() {
  return (
    <>
      <PageHeader eyebrow="Para fundaciones" title="Panel de tu fundación">
        Registra tu fundación, publica campañas con fotos y sube la evidencia que libera los fondos.
      </PageHeader>
      <section className="container-page py-10">
        <RequireWallet title="Conecta la wallet de tu fundación" text="La dirección de tu wallet será la identidad de la fundación en BITAJÓN. Usa siempre la misma.">
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
      <EmptyState icon={<CircleSlash className="h-6 w-6" />} title="Tu fundación fue revocada">
        El administrador revocó el registro de {profile.data.legal_name}. No puedes crear campañas nuevas. Escríbele al equipo de BITAJÓN si crees
        que es un error.
      </EmptyState>
    );
  return <Dashboard profile={profile.data} address={address!} />;
}

/* ------------------------------------------------------------------ */
/* Registro                                                            */
/* ------------------------------------------------------------------ */

function RegisterForm() {
  const { run, pending } = useTx();
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
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
              // 1. Registro on-chain (queda la huella del RUT en el contrato).
              const tx = await registerNonprofit(s, {
                legalName: legalName.trim(),
                taxId: taxId.trim(),
                email: email.trim(),
                rutHash: rut.hash,
                retentionCertificate: retention,
                dataConsent: consent,
              });
              // 2. RUT al almacenamiento privado (solo lo ve el admin) y perfil público.
              await saveRut(s, rut.file);
              await saveNonprofitProfile(s, { display_name: legalName.trim(), description, ...socials, logo });
              return tx;
            },
            { loading: "Registrando tu fundación…", success: "Registro enviado. Queda pendiente de aprobación." },
          );
        }}
      >
        <h2 className="text-2xl font-semibold">Registra tu fundación</h2>
        <p className="mt-1 text-sm text-slate-600">El equipo de BITAJÓN revisa los datos y el RUT, y aprueba la fundación.</p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="label">Razón social</span>
            <input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Fundación Amigos Samaritanos" required />
          </label>
          <label>
            <span className="label">NIT</span>
            <input className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="900.123.456-7" inputMode="numeric" required />
          </label>
          <label>
            <span className="label">Correo de contacto</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contacto@fundacion.org" required />
          </label>
          <div className="sm:col-span-2">
            <span className="label inline-flex items-center gap-1.5">
              RUT (PDF o foto) <Lock className="h-3.5 w-3.5 text-slate-400" />
            </span>
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-4 text-sm font-semibold text-brand-800 hover:border-leaf-400 hover:bg-leaf-50">
              <FileUp className="h-4 w-4" /> {rut ? rut.file.name : "Elegir archivo del RUT"}
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
            <p className="hint">Privado: solo el administrador de BITAJÓN puede abrirlo. En la red queda su huella ({rut ? `${toHex(rut.hash).slice(0, 16)}…` : "SHA-256"}). Máx. 5 MB.</p>
          </div>
        </div>

        <h3 className="mt-8 text-lg font-semibold">Perfil público</h3>
        <p className="text-sm text-slate-600">Esto lo ven los donantes en cada campaña. Puedes editarlo después.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr]">
          <LogoField file={logo} onChange={setLogo} name={legalName || "Fundación"} />
          <label>
            <span className="label">Quiénes son y qué hacen</span>
            <textarea className="input min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1200} placeholder="Atendemos a 30 niños y niñas en Patio Bonito con comedor comunitario y jornada educativa alterna…" />
          </label>
        </div>
        <div className="mt-5">
          <SocialFields value={socials} onChange={setSocials} />
        </div>

        <div className="mt-6 space-y-3">
          <Checkbox checked={retention} onChange={setRetention} label="La fundación cuenta con certificado de retención" />
          <Checkbox checked={consent} onChange={setConsent} label="Autorizo el tratamiento de los datos de la fundación (Habeas Data, Ley 1581 de 2012)" />
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-xs text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          La razón social, el NIT y el correo quedan públicos en la red. No pongas datos personales de beneficiarios ni de menores.
        </div>

        <button type="submit" className="btn-primary mt-6 w-full !py-3" disabled={!valid || pending}>
          {pending ? <Spinner className="h-4 w-4" /> : <Building2 className="h-4 w-4" />} Enviar registro
        </button>
        <p className="hint text-center">Tu wallet te pedirá dos firmas: el registro en el contrato y la subida del RUT y el perfil.</p>
      </form>

      <aside className="space-y-4">
        <div className="card p-6">
          <h3 className="text-lg font-semibold">¿Qué pasa después?</h3>
          <ol className="mt-4 space-y-4 text-sm text-slate-600">
            <li>
              <b className="text-brand-900">1. Revisión.</b> El equipo revisa tu RUT y aprueba la fundación.
            </li>
            <li>
              <b className="text-brand-900">2. Campañas.</b> Publicas campañas con fotos, meta y fecha. Cada una abre su bóveda.
            </li>
            <li>
              <b className="text-brand-900">3. Primer desembolso.</b> Al llegar a la meta recibes el {MILESTONE_PERCENTAGE}% automáticamente.
            </li>
            <li>
              <b className="text-brand-900">4. Evidencia.</b> Publicas fotos y facturas, y se libera el resto.
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
      <label className="block cursor-pointer" title="Cambiar logo">
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

/** `target`: si lo usa el admin para editar otra fundación (sin la opción del RUT). */
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
      <h3 className="text-xl font-semibold">Perfil público de la fundación</h3>
      <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr]">
        <LogoField file={logo} onChange={setLogo} existing={meta?.logo_path} name={displayName} />
        <div className="space-y-4">
          <label className="block">
            <span className="label">Nombre para mostrar</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} />
          </label>
          <label className="block">
            <span className="label">Quiénes son y qué hacen</span>
            <textarea className="input min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1200} />
          </label>
        </div>
      </div>
      <div className="mt-5">
        <SocialFields value={socials} onChange={setSocials} />
      </div>
      {!target && <div className="mt-5">
        <span className="label inline-flex items-center gap-1.5">
          Volver a subir el RUT (opcional) <Lock className="h-3.5 w-3.5 text-slate-400" />
        </span>
        <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-brand-800 hover:border-leaf-400">
          <FileUp className="h-4 w-4" /> {rut ? rut.name : "Elegir archivo"}
          <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => setRut(e.target.files?.[0] ?? null)} />
        </label>
        <p className="hint">Úsalo si el RUT no se subió en el registro. Debe ser el mismo archivo: el admin compara su huella con la registrada en la red.</p>
      </div>}
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
            { loading: "Guardando el perfil…", success: "Perfil actualizado." },
          ).then((r) => r && onDone?.())
        }
      >
        {pending && <Spinner className="h-4 w-4" />} Guardar perfil
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
        <h2 className="mt-4 text-2xl font-semibold">{profile.legal_name} está en revisión</h2>
        <p className="mt-2 text-sm text-slate-600">
          Recibimos tu registro. Cuando el administrador lo apruebe podrás publicar campañas desde aquí. Para agilizarlo, comparte esta dirección con
          el equipo:
        </p>
        <div className="mx-auto mt-4 flex max-w-md items-center gap-1 rounded-xl bg-sand p-3 ring-1 ring-slate-200">
          <code className="flex-1 font-mono text-xs break-all text-brand-900">{address}</code>
          <CopyButton value={address} />
        </div>
        <dl className="mx-auto mt-6 grid max-w-md gap-2 text-left text-sm">
          <Row k="NIT" v={profile.tax_id} />
          <Row k="Correo" v={profile.email} />
          <Row k="Certificado de retención" v={profile.retention_certificate ? "Sí" : "No"} />
        </dl>
        {!meta.isLoading && !meta.data && (
          <p className="mx-auto mt-6 max-w-md rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Falta completar el perfil público y subir el RUT para que el admin pueda revisarlo.</p>
        )}
        <button type="button" className="btn-outline mt-6" onClick={() => setEditing((e) => !e)}>
          <Pencil className="h-4 w-4" /> {editing ? "Cerrar" : meta.data ? "Editar perfil" : "Completar perfil y RUT"}
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
/* Panel de la fundación aprobada                                       */
/* ------------------------------------------------------------------ */

function Dashboard({ profile, address }: { profile: NonprofitProfile; address: string }) {
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
              <BadgeCheck className="h-4 w-4" /> Fundación aprobada
            </p>
            <h2 className="mt-0.5 text-2xl font-semibold">{name}</h2>
            <p className="text-sm text-slate-500">NIT {profile.tax_id}</p>
            {meta.data && <SocialLinks socials={meta.data} className="mt-2" />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={() => setEditingProfile((e) => !e)}>
            <Pencil className="h-4 w-4" /> Perfil y redes
          </button>
          <button type="button" className="btn-primary" onClick={() => setCreating((c) => !c)}>
            {creating ? <XCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {creating ? "Cerrar" : "Nueva campaña"}
          </button>
        </div>
      </div>

      {editingProfile && <ProfileEditor profile={profile} meta={meta.data} onDone={() => setEditingProfile(false)} />}
      {creating && <CreateCampaign onDone={() => setCreating(false)} />}

      <div>
        <h3 className="text-xl font-semibold">Tus campañas</h3>
        <div className="mt-4 space-y-4">
          {campaigns.isLoading ? (
            <Spinner className="h-6 w-6 text-brand-600" />
          ) : mine.length === 0 ? (
            <EmptyState
              icon={<Rocket className="h-6 w-6" />}
              title="Aún no tienes campañas"
              action={
                !creating && (
                  <button className="btn-primary" onClick={() => setCreating(true)}>
                    Crear la primera
                  </button>
                )
              }
            >
              Crea una campaña con un fin concreto: kits escolares, Navidad, la fiesta del niño.
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
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
    Number(deadlineSec) * 1000 > Date.now();

  async function submit() {
    if (!valid || !targetUnits || !deadlineSec) return;
    setStep(1);
    const created = await run(
      (s) => createCampaign(s, { name: name.trim(), description: description.trim(), location: location.trim(), targetAmount: targetUnits, deadline: deadlineSec }),
      { loading: "Paso 1: creando la campaña…", success: "Campaña creada." },
    );
    if (!created) return setStep(0);
    const id = BigInt(created.result);
    setStep(2);
    const vault = await run((s) => createVault(s, id), { loading: "Paso 2: abriendo la bóveda…", success: "La campaña ya recibe donaciones." }, { campaignId: id });
    if (cover || gallery.length) {
      setStep(3);
      await run(
        async (s) => {
          await saveCampaignMedia(s, id, { cover, gallery });
          return { result: null, hash: "" };
        },
        { loading: "Paso 3: subiendo las fotos…", success: "Fotos publicadas." },
        { campaignId: id },
      );
    }
    setStep(0);
    if (vault) onDone();
  }

  return (
    <div className="card animate-rise p-6 sm:p-8">
      <h3 className="text-xl font-semibold">Nueva campaña</h3>
      <p className="mt-1 text-sm text-slate-600">Se firma la creación de la campaña, la apertura de su bóveda y, si agregas fotos, su subida.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Nombre</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kits escolares 2027 para Patio Bonito" maxLength={80} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Descripción</span>
          <textarea
            className="input min-h-32"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Qué se va a entregar, a cuántos niños y niñas, cuándo y cómo lo van a demostrar."
            maxLength={1000}
          />
          <p className="hint">{description.length}/1000 · mínimo 20 caracteres</p>
        </label>
        <div className="sm:col-span-2 grid gap-5 lg:grid-cols-2">
          <CoverPicker file={cover} onChange={setCover} />
          <GalleryPicker files={gallery} onChange={setGallery} />
        </div>
        <label>
          <span className="label">Lugar</span>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Patio Bonito, Bogotá" />
        </label>
        <label>
          <span className="label">Meta en {TOKEN_SYMBOL}</span>
          <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1000" />
          <p className="hint">Es lo que debe llegar a la bóveda (neto, después de la comisión).</p>
        </label>
        <label>
          <span className="label">Fecha límite</span>
          <input className="input" type="date" min={minDate} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <div className="rounded-2xl bg-sand p-4 text-sm text-slate-600">
          Al llegar a la meta recibes el <b className="text-brand-900">{MILESTONE_PERCENTAGE}%</b>. El resto se libera cuando el admin valida tu evidencia.
        </div>
      </div>
      <button type="button" className="btn-primary mt-6 w-full !py-3 sm:w-auto" disabled={!valid || pending} onClick={submit}>
        {pending && <Spinner className="h-4 w-4" />}
        {step === 1 ? "Creando campaña (1/3)…" : step === 2 ? "Abriendo bóveda (2/3)…" : step === 3 ? "Subiendo fotos (3/3)…" : "Publicar campaña"}
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
            { loading: "Guardando las fotos…", success: "Fotos actualizadas." },
            { campaignId },
          ).then((r) => r && onDone())
        }
      >
        {pending && <Spinner className="h-4 w-4" />} Guardar fotos
      </button>
    </div>
  );
}

function OwnCampaign({ view }: { view: CampaignView }) {
  const { run, pending } = useTx();
  const metaMap = useCampaignMetaMap();
  const [editingMedia, setEditingMedia] = useState(false);
  const stage = stageOf(view);
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
              <StageBadge stage={stage} />
              <span className="text-xs text-slate-400">#{view.id.toString()}</span>
            </div>
            <Link to={`/campanas/${view.id.toString()}`} className="mt-2 inline-flex items-center gap-1.5 text-lg font-semibold text-brand-900 hover:text-brand-700">
              {view.campaign.name} <ExternalLink className="h-4 w-4" />
            </Link>
            <p className="text-sm text-slate-500">
              {formatToken(raised(view))} de {formatToken(view.campaign.target_amount)} · {timeLeftLabel(view.campaign.deadline)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {stage !== "cancelled" && (
            <button type="button" className="btn-outline" onClick={() => setEditingMedia((e) => !e)}>
              <ImageIcon className="h-4 w-4" /> {editingMedia ? "Cerrar" : "Fotos"}
            </button>
          )}
          {stage === "draft" && (
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => run((s) => createVault(s, view.id), { loading: "Abriendo la bóveda…", success: "Bóveda abierta: ya recibe donaciones." }, { campaignId: view.id })}
            >
              Abrir bóveda
            </button>
          )}
          {(stage === "draft" || stage === "active") && (
            <button
              type="button"
              className="btn-outline !text-rose-700"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("¿Cancelar esta campaña? Esta acción no se puede deshacer.")) return;
                void run((s) => cancelCampaign(s, view.id), { loading: "Cancelando la campaña…", success: "Campaña cancelada." }, { campaignId: view.id });
              }}
            >
              Cancelar
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
          <p className="text-sm text-slate-600">Evidencia publicada. Esperando la validación del admin.</p>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">¿Te equivocaste de archivo? Reemplázala</summary>
            <div className="mt-3">
              <EvidenceUpload campaignId={view.id} replacing />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
