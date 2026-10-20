"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { dataService } from "@/lib/data-service";

const BUCKET = "documentos-obras";
export function Adjuntos({
  value,
  onChange,
  multiple = false,
  images = false,
  onBusyChange,
}: {
  value: string[];
  onChange: (files: string[]) => void;
  multiple?: boolean;
  images?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <input
        type="file"
        aria-label={
          images ? "Subir fotografías" : "Subir comprobante o documento"
        }
        accept={
          images
            ? "image/jpeg,image/png,image/webp"
            : "image/jpeg,image/png,image/webp,application/pdf"
        }
        multiple={multiple}
        disabled={busy}
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          setError("");
          setBusy(true);
          onBusyChange?.(true);
          const uploaded: string[] = [];
          try {
            const tenant = dataService.getActiveUser()?.empresa_id;
            if (!tenant) throw new Error("Inicia sesión para subir archivos.");
            if (files.some((f) => f.size > 10 * 1024 * 1024))
              throw new Error("Cada archivo puede pesar hasta 10 MB.");
            for (const file of files) {
              if (
                ![
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                  ...(images ? [] : ["application/pdf"]),
                ].includes(file.type)
              )
                throw new Error("Formato no compatible.");
              const path = `${tenant}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
              const { error } = await supabase.storage
                .from(BUCKET)
                .upload(path, file, { upsert: false, contentType: file.type });
              if (error) throw error;
              uploaded.push(path);
            }
            onChange(multiple ? [...value, ...uploaded] : uploaded);
          } catch (e) {
            if (uploaded.length)
              await supabase.storage.from(BUCKET).remove(uploaded);
            setError(
              (e as { message?: string }).message ||
                "No se pudo subir el archivo.",
            );
          } finally {
            setBusy(false);
            onBusyChange?.(false);
          }
        }}
      />
      {busy && (
        <p role="status" className="text-sm">
          Subiendo…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {value.map((path, i) => (
          <span key={path} className="flex gap-2 items-center text-xs">
            <Archivo path={path} label={`Archivo ${i + 1}`} />
            <button
              type="button"
              aria-label={`Quitar archivo ${i + 1}`}
              onClick={() => onChange(value.filter((p) => p !== path))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
export function Archivo({
  path,
  label = "Ver adjunto",
  photo = false,
}: {
  path: string;
  label?: string;
  photo?: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (path.startsWith("https://")) {
      setUrl(path);
      return;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl || "");
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-orange-600 underline underline-offset-2"
    >
      {photo ? (
        <img
          src={url}
          alt={label}
          className="h-28 w-36 rounded-xl object-cover"
        />
      ) : (
        label
      )}
    </a>
  ) : (
    <span className="op-muted text-xs">Adjunto no disponible</span>
  );
}
