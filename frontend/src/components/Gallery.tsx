import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { tr } from "../lib/i18n";
import { useEffect, useState } from "react";

/** Galería en cuadrícula con visor a pantalla completa (teclado: ← → Esc). */
export function Gallery({ urls, title }: { urls: string[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % urls.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + urls.length) % urls.length));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, urls.length]);

  if (urls.length === 0) return null;
  return (
    <>
      <div className={`grid gap-2 ${urls.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            onClick={() => setOpen(i)}
            className={`group relative overflow-hidden rounded-2xl ring-1 ring-slate-200 ${i === 0 && urls.length > 2 ? "col-span-2 row-span-2" : ""}`}
          >
            <img src={u} alt={`${title}, ${tr("foto", "photo")} ${i + 1}`} loading="lazy" className={`${urls.length === 1 ? "aspect-video" : "aspect-square"} h-full w-full object-cover transition duration-500 group-hover:scale-105`} />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-950/90 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <img src={urls[open]} alt={`${title}, ${tr("foto", "photo")} ${open + 1}`} className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-lift" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="absolute top-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label={tr("Cerrar", "Close")} onClick={() => setOpen(null)}>
            <X className="h-5 w-5" />
          </button>
          {urls.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
                aria-label={tr("Anterior", "Previous")}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open - 1 + urls.length) % urls.length);
                }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
                aria-label={tr("Siguiente", "Next")}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open + 1) % urls.length);
                }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <p className="absolute bottom-4 text-sm text-white/80">
                {open + 1} / {urls.length}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
