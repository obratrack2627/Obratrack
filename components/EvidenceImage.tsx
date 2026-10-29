"use client";
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { aiHeaders } from "@/lib/ai/client";
const prefix = "whatsapp-evidencias:";
export default function EvidenceImage({
  src,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl("");
    setError("");
    if (!src?.startsWith(prefix)) {
      setUrl(src || "");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          "/api/whatsapp/adjuntos?path=" +
            encodeURIComponent(src.slice(prefix.length)),
          { headers: await aiHeaders() },
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "No se pudo abrir la foto.");
        if (active) setUrl(body.url);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [src, retry]);
  if (error)
    return (
      <span role="status" className="text-xs text-red-700">
        {error}{" "}
        <button type="button" onClick={() => setRetry((r) => r + 1)}>
          Reintentar
        </button>
      </span>
    );
  if (!url)
    return <span className="text-xs text-gray-500">Cargando foto…</span>;
  return <img {...props} alt={alt || "Evidencia de obra"} src={url} />;
}
