import { FileText, FileUp, X } from "lucide-react";
import { useState } from "react";
import { useTx } from "../hooks/useTx";
import { uploadEvidence } from "../lib/offchain";
import { submitEvidence } from "../lib/stellar";
import { Spinner } from "./ui";

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILES = 10;
const MAX_MB = 10;

export function EvidenceUpload({ campaignId, replacing = false }: { campaignId: bigint; replacing?: boolean }) {
  const { run, pending } = useTx();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [warn, setWarn] = useState("");

  function add(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const ok = picked.filter((f) => ACCEPT.includes(f.type) && f.size <= MAX_MB * 1048576);
    setWarn(ok.length < picked.length ? `Algunos archivos no se agregaron: solo fotos (JPG, PNG, WebP) o PDF de máximo ${MAX_MB} MB.` : "");
    setFiles((f) => [...f, ...ok].slice(0, MAX_FILES));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-sand p-4 sm:p-5">
      <p className="text-sm font-semibold text-brand-900">{replacing ? "Reemplazar evidencia" : "Publicar la evidencia del uso de los fondos"}</p>
      <p className="mt-1 text-xs text-slate-600">
        Sube fotos de la entrega, facturas y actas (PDF). Quedan públicas en la campaña y su huella se registra en Stellar: si alguien cambia un archivo, la
        página lo detecta. Al validarla, el admin libera el 50% restante.
      </p>

      <label className="mt-3 block">
        <span className="label">Qué se hizo con los fondos</span>
        <textarea
          className="input min-h-24"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={800}
          placeholder="Ej.: El 14 de diciembre entregamos 40 kits escolares en el salón comunal. Adjuntamos el acta firmada y las facturas."
        />
      </label>

      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-brand-800 hover:border-leaf-400">
        <FileUp className="h-4 w-4" /> Agregar fotos o PDF ({files.length}/{MAX_FILES})
        <input type="file" multiple accept={ACCEPT.join(",")} className="sr-only" onChange={(e) => add(e.target.files)} />
      </label>
      {warn && <p className="mt-2 text-xs text-amber-800">{warn}</p>}

      {files.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-leaf-600" />
                <span className="truncate">{f.name}</span>
              </span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="text-slate-400 hover:text-rose-600">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={files.length === 0 || pending}
        onClick={() =>
          run(
            async (s) => {
              const manifestHash = await uploadEvidence(s, campaignId, files, note);
              return submitEvidence(s, campaignId, manifestHash);
            },
            { loading: "Subiendo la evidencia y registrando su huella…", success: "Evidencia publicada y registrada en la red." },
            { campaignId },
          ).then((r) => {
            if (r) {
              setFiles([]);
              setNote("");
            }
          })
        }
      >
        {pending && <Spinner className="h-4 w-4" />} Publicar evidencia
      </button>
      <p className="hint text-center">Tu wallet te pedirá dos firmas: una para subir los archivos y otra para registrar la huella en el contrato.</p>
    </div>
  );
}
