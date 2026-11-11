import { FileText, FileUp, X } from "lucide-react";
import { tr } from "../lib/i18n";
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
    setWarn(ok.length < picked.length ? tr(`Algunos archivos no se agregaron: solo fotos (JPG, PNG, WebP) o PDF de máximo ${MAX_MB} MB.`, `Some files were not added: only photos (JPG, PNG, WebP) or PDF up to ${MAX_MB} MB.`) : "");
    setFiles((f) => [...f, ...ok].slice(0, MAX_FILES));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-sand p-4 sm:p-5">
      <p className="text-sm font-semibold text-brand-900">{replacing ? tr("Reemplazar evidencia", "Replace evidence") : tr("Publicar la evidencia del uso de los fondos", "Publish evidence of how the funds were used")}</p>
      <p className="mt-1 text-xs text-slate-600">
        {tr(
          "Sube fotos de la entrega, facturas y actas (PDF). Quedan públicas en la campaña y su huella se registra en Stellar: si alguien cambia un archivo, la página lo detecta. Al validarla, el verificador libera el resto.",
          "Upload photos of the delivery, invoices and signed records (PDF). They become public on the campaign and their fingerprint is registered on Stellar: if anyone changes a file, the page detects it. Once validated, the verifier releases the rest.",
        )}
      </p>

      <label className="mt-3 block">
        <span className="label">{tr("Qué se hizo con los fondos", "What was done with the funds")}</span>
        <textarea
          className="input min-h-24"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={800}
          placeholder={tr("Ej.: El 14 de diciembre entregamos 40 kits escolares en el salón comunal. Adjuntamos el acta firmada y las facturas.", "E.g.: On December 14 we delivered 40 school kits at the community hall. Signed record and invoices attached.")}
        />
      </label>

      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-brand-800 hover:border-leaf-400">
        <FileUp className="h-4 w-4" /> {tr("Agregar fotos o PDF", "Add photos or PDF")} ({files.length}/{MAX_FILES})
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
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`${tr("Quitar", "Remove")} ${f.name}`} className="text-slate-400 hover:text-rose-600">
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
            { loading: tr("Subiendo la evidencia y registrando su huella…", "Uploading the evidence and registering its fingerprint…"), success: tr("Evidencia publicada y registrada en la red.", "Evidence published and registered on the network.") },
            { campaignId },
          ).then((r) => {
            if (r) {
              setFiles([]);
              setNote("");
            }
          })
        }
      >
        {pending && <Spinner className="h-4 w-4" />} {tr("Publicar evidencia", "Publish evidence")}
      </button>
      <p className="hint text-center">{tr("Te pediremos dos firmas: una para subir los archivos y otra para registrar la huella en el contrato.", "You will be asked for two signatures: one to upload the files and another to register the fingerprint in the contract.")}</p>
    </div>
  );
}
