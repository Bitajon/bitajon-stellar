import { coverFor } from "../lib/covers";

export function CampaignCover({ name, description, className = "h-40", big = false }: { name: string; description?: string; className?: string; big?: boolean }) {
  const { icon: Icon, from, to } = coverFor(name, description);
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
