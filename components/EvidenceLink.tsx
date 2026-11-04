'use client';
import { useEffect, useState } from 'react';
import { aiHeaders } from '@/lib/ai/client';
export default function EvidenceLink({ path, name }: { path: string; name: string }) {
  const [url,setUrl] = useState('');
  const [error,setError] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false); setUrl('');
    void (async () => {
      try {
        const response = await fetch('/api/whatsapp/adjuntos?path='+encodeURIComponent(path), { headers: await aiHeaders() });
        const result = await response.json();
        if (!response.ok || !result.url) throw new Error('Archivo no disponible');
        if (active) setUrl(result.url);
      } catch { if (active) setError(true); }
    })();
    return () => { active = false; };
  }, [path,attempt]);
  if (error) return <button type="button" className="text-xs text-red-600 underline" onClick={() => setAttempt(n => n+1)}>Reintentar acceso al archivo</button>;
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-xl border border-obra-orange/20 px-3 py-2 text-sm text-obra-orange"><span aria-hidden="true">📎</span><span className="truncate">{name}</span></a> : <span role="status" className="text-xs text-gray-500">Cargando archivo…</span>;
}
