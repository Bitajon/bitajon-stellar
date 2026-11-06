import { useState } from "react";
import { coverFor } from "../lib/covers";

/**
 * Portada de campaña: la foto que subió la fundación, o una ilustración generada
 * según el tema si todavía no hay foto.
 */
export function CampaignCover({
  name,
  description,
  imageUrl,
  className = "h-40",
  big = false,
}: {
  name: string;
  description?: string;
  imageUrl?: string | null;
  className?: string;
  big?: boolean;
}) {
  const { icon: Icon, from, to } = coverFor(name, description);
  const [failed, setFailed] = useState(false);

  if (imageUrl && !failed) {
    return (
      <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
        <img src={imageUrl} alt={`Foto de la campaña ${name}`} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-950/35 via-transparent to-transparent" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} aria-hidden>
      {/* Curvas inspiradas en la cinta del logo */}
      <svg className="absolute inset-0 h-full w-full opacity-25" viewBox="0 0 400 200" preserveAspectRatio="none">
        <path d="M-20 170 C 80 60, 160 60, 230 120 S 360 190, 420 40" fill="none" stroke="white" strokeWidth="14" strokeLinecap="round" />
        <path d="M-20 205 C 90 110, 170 110, 240 160 S 370 230, 430 90" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" opacity="0.6" />
      </svg>
      <div className="absolute -right-6 -bottom-8 text-white/15">
        <Icon className={big ? "h-64 w-64" : "h-40 w-40"} strokeWidth={1.25} />
      </div>
      <div className="absolute top-4 left-4 grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}
