import { Buffer } from "buffer";
import { FileUp, Fingerprint } from "lucide-react";
import { useState } from "react";
import { useTx } from "../hooks/useTx";
import { sha256File, toHex } from "../lib/hash";
import { submitEvidence } from "../lib/stellar";
import { Spinner } from "./ui";

export function EvidenceUpload({ campaignId, replacing = false }: { campaignId: bigint; replacing?: boolean }) {
  const { run, pending } = useTx();
  const [file, setFile] = useState<{ name: string; size: number; hash: Buffer } | null>(null);

  async function pick(f: File) {
    setFile({ name: f.name, size: f.size, hash: await sha256File(f) });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-sand p-4">
      <p className="text-sm font-semibold text-brand-900">{replacing ? "Reemplazar evidencia" : "Subir evidencia del uso de los fondos"}</p>
      <p className="mt-1 text-xs text-slate-600">
        Elige un archivo (PDF con fotos y facturas, o un .zip). Se registra su huella SHA-256 en la red; el archivo queda contigo, guárdalo
        para mostrarlo a quien lo pida.
      </p>
      <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-brand-800 hover:border-leaf-400">
        <FileUp className="h-4 w-4" /> {file ? file.name : "Elegir archivo"}
        <input
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
      </label>
      {file && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600">
          <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf-600" />
          <code className="break-all">{toHex(file.hash)}</code>
        </p>
      )}
      <button
        type="button"
        className="btn-primary mt-3 w-full"
        disabled={!file || pending}
        onClick={() =>
          file &&
          run((s) => submitEvidence(s, campaignId, file.hash), { loading: "Registrando la evidencia…", success: "Evidencia registrada en la red." }, { campaignId })
        }
      >
        {pending && <Spinner className="h-4 w-4" />} Registrar evidencia
      </button>
    </div>
  );
}
