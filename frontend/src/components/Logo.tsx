import { Link } from "react-router-dom";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="BITAJÓN, inicio">
      <img src="/brand/mark.png" alt="" className="h-8 w-auto transition group-hover:scale-105" width={60} height={32} />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-xl font-semibold tracking-wide text-brand-700">BITAJÓN</span>
          <span className="mt-0.5 text-[0.6rem] font-bold tracking-[0.32em] text-leaf-700">TRUST &amp; HOPE</span>
        </span>
      )}
    </Link>
  );
}
