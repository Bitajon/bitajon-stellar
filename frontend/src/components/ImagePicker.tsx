import { ImagePlus, X } from "lucide-react";
import { tr } from "../lib/i18n";
import { useEffect, useMemo } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_MB = 15; // antes de comprimir; se reduce a ≤1920 px al subir

function usePreviews(files: File[]) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

function pickImages(list: FileList | null): File[] {
  return Array.from(list ?? []).filter((f) => ACCEPT.split(",").includes(f.type) && f.size <= MAX_MB * 1048576);
}

/** Portada: una sola imagen. `existing` es la URL de la portada actual (al editar). */
export function CoverPicker({
  file,
  onChange,
  existing,
  onRemoveExisting,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  existing?: string | null;
  onRemoveExisting?: () => void;
}) {
  const [preview] = usePreviews(file ? [file] : []);
  const shown = preview ?? existing ?? null;
  return (
    <div>
      <span className="label">{tr("Foto de portada", "Cover photo")}</span>
      {shown ? (
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <img src={shown} alt={tr("Vista previa de la portada", "Cover preview")} className="aspect-[16/9] w-full object-cover" />
          <button
            type="button"
            onClick={() => (file ? onChange(null) : onRemoveExisting?.())}
            className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-slate-700 shadow-soft hover:bg-white"
            aria-label={tr("Quitar portada", "Remove cover")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-sand text-sm font-semibold text-brand-800 transition hover:border-leaf-400 hover:bg-leaf-50">
          <ImagePlus className="h-6 w-6 text-leaf-600" />
          {tr("Elegir foto de portada", "Choose a cover photo")}
          <span className="text-xs font-normal text-slate-500">{tr("JPG, PNG o WebP. Horizontal se ve mejor.", "JPG, PNG or WebP. Landscape looks best.")}</span>
          <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onChange(pickImages(e.target.files)[0] ?? null)} />
        </label>
      )}
    </div>
  );
}

/** Galería: varias imágenes nuevas + las ya publicadas (al editar). */
export function GalleryPicker({
  files,
  onChange,
  existing = [],
  onRemoveExisting,
  max = 8,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  existing?: { path: string; url: string }[];
  onRemoveExisting?: (path: string) => void;
  max?: number;
}) {
  const previews = usePreviews(files);
  const total = existing.length + files.length;
  return (
    <div>
      <span className="label">{tr("Galería de fotos", "Photo gallery")} ({total}/{max})</span>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {existing.map((e) => (
          <Thumb key={e.path} url={e.url} onRemove={() => onRemoveExisting?.(e.path)} />
        ))}
        {previews.map((u, i) => (
          <Thumb key={u} url={u} onRemove={() => onChange(files.filter((_, j) => j !== i))} />
        ))}
        {total < max && (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs font-semibold text-brand-800 hover:border-leaf-400 hover:bg-leaf-50">
            <ImagePlus className="h-5 w-5 text-leaf-600" /> {tr("Agregar", "Add")}
            <input
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={(e) => onChange([...files, ...pickImages(e.target.files)].slice(0, max - existing.length))}
            />
          </label>
        )}
      </div>
      <p className="hint">
        {tr(
          "Muestra la causa: el lugar, las actividades, lo que se va a entregar. No publiques caras de niños sin autorización de sus acudientes.",
          "Show the cause: the place, the activities, what will be delivered. Don't publish children's faces without their guardians' consent.",
        )}
      </p>
    </div>
  );
}

function Thumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-slate-200">
      <img src={url} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-700 shadow-soft hover:bg-white"
        aria-label={tr("Quitar foto", "Remove photo")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
