"use client";

import { useId, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { PROOF_ACCEPT, proofFileError, uploadProof } from "./proofFile";

/**
 * Nachweis nachreichen oder ersetzen – auf der Statusseite, solange über den
 * Antrag nicht entschieden ist. Lädt direkt nach der Auswahl hoch.
 */
export default function ProofUpload({
  statusToken,
  requestId,
  hasProof,
  onUploaded,
}: {
  statusToken: string;
  requestId: number;
  hasProof: boolean;
  onUploaded: () => void;
}) {
  const id = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const fileError = await proofFileError(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setUploading(true);
    setError(null);
    const result = await uploadProof(statusToken, requestId, file);
    setUploading(false);
    if (result.ok) onUploaded();
    else setError(result.error);
  }

  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs cursor-pointer ${
          hasProof ? "border-gray-200 bg-white text-gray-600 hover:bg-gray-50" : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
        }`}
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
        {uploading ? "Wird hochgeladen …" : hasProof ? "Nachweis ersetzen" : "Nachweis hochladen"}
      </label>
      <input
        id={id}
        type="file"
        accept={PROOF_ACCEPT}
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
