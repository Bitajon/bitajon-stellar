import { AtSign, BadgeCheck, Building2, Globe, MessageCircle } from "lucide-react";
import { tr } from "../lib/i18n";
import type { ReactNode } from "react";
import { useNonprofitMeta, useProfile } from "../hooks/queries";
import { shortAddress } from "../lib/format";
import { BUCKETS, publicUrl, type Socials } from "../lib/offchain";

const SOCIALS: { key: keyof Socials; label: string; icon: ReactNode; placeholder: string }[] = [
  { key: "website", label: "Web", icon: <Globe className="h-4 w-4" />, placeholder: "https://mifundacion.org" },
  { key: "instagram", label: "Instagram", icon: <AtSign className="h-4 w-4" />, placeholder: "@mifundacion" },
  { key: "facebook", label: "Facebook", icon: <AtSign className="h-4 w-4" />, placeholder: "facebook.com/mifundacion" },
  { key: "tiktok", label: "TikTok", icon: <AtSign className="h-4 w-4" />, placeholder: "@mifundacion" },
  { key: "x", label: "X", icon: <AtSign className="h-4 w-4" />, placeholder: "@mifundacion" },
  { key: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" />, placeholder: "+57 300 123 4567" },
];

/** Convierte lo que escribió la fundación (usuario o enlace) en un enlace https seguro. */
export function socialHref(key: keyof Socials, raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/^(www\.)?(instagram|facebook|tiktok|x|twitter)\.com\//i, "").replace(/^@/, "");
  switch (key) {
    case "website":
      return `https://${v.replace(/^\/+/, "")}`;
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "facebook":
      return `https://facebook.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    case "whatsapp": {
      let digits = v.replace(/\D/g, "");
      if (digits.length === 10) digits = `57${digits}`; // número colombiano sin indicativo
      return digits.length >= 8 ? `https://wa.me/${digits}` : null;
    }
  }
  return null;
}

export function SocialLinks({ socials, className = "" }: { socials: Socials; className?: string }) {
  const items = SOCIALS.map((s) => ({ ...s, href: socialHref(s.key, socials[s.key]) })).filter((s) => s.href);
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((s) => (
        <a
          key={s.key}
          href={s.href!}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-800 ring-1 ring-slate-200 hover:bg-brand-50 hover:ring-brand-200"
        >
          {s.icon} {s.label}
        </a>
      ))}
    </div>
  );
}

/** Campos de redes sociales para los formularios de la fundación. */
export function SocialFields({ value, onChange }: { value: Socials; onChange: (v: Socials) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SOCIALS.map((s) => (
        <label key={s.key}>
          <span className="label inline-flex items-center gap-1.5">
            {s.icon} {s.label}
          </span>
          <input className="input" value={value[s.key] ?? ""} onChange={(e) => onChange({ ...value, [s.key]: e.target.value })} placeholder={s.placeholder} maxLength={200} />
        </label>
      ))}
    </div>
  );
}

export function NonprofitLogo({ path, name, size = "h-14 w-14" }: { path?: string | null; name: string; size?: string }) {
  const url = publicUrl(BUCKETS.media, path);
  return url ? (
    <img src={url} alt={`${tr("Logo de", "Logo of")} ${name}`} className={`${size} shrink-0 rounded-2xl bg-white object-contain ring-1 ring-slate-200`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-leaf-50 text-brand-700 ring-1 ring-brand-100`}>
      <Building2 className="h-6 w-6" />
    </span>
  );
}

/** Tarjeta pública de la fundación: logo, nombre, descripción y redes. */
export function NonprofitCard({ address }: { address: string }) {
  const profile = useProfile(address);
  const meta = useNonprofitMeta(address);
  const name = meta.data?.display_name || profile.data?.legal_name || shortAddress(address);
  const approved = profile.data?.status.tag === "Approved";
  return (
    <section className="card p-6">
      <p className="eyebrow">{tr("Quién organiza", "Organized by")}</p>
      <div className="mt-3 flex items-start gap-4">
        <NonprofitLogo path={meta.data?.logo_path} name={name} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-lg font-semibold text-brand-900">
            {name} {approved && <BadgeCheck className="h-5 w-5 shrink-0 text-leaf-600" aria-label={tr("Fundación verificada", "Verified nonprofit")} />}
          </p>
          {profile.data && <p className="text-xs text-slate-500">NIT {profile.data.tax_id}</p>}
        </div>
      </div>
      {meta.data?.description && <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-slate-700">{meta.data.description}</p>}
      {meta.data && <SocialLinks socials={meta.data} className="mt-4" />}
    </section>
  );
}
