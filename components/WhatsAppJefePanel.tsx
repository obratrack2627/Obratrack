"use client";
import { useEffect, useState } from "react";
import { aiHeaders } from "@/lib/ai/client";
import AIMessageTools from "./AIMessageTools";
import { dataService } from "@/lib/data-service";

export default function WhatsAppJefePanel() {
  const [status, setStatus] = useState<any>(null),
    [messages, setMessages] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const [health, inbox] = await Promise.all([
        fetch("/api/webhook/whatsapp"),
        aiHeaders().then((headers) =>
          fetch("/api/whatsapp/mensajes", { headers }),
        ),
      ]);
      if (health.ok) setStatus(await health.json());
      const data = await inbox.json();
      if (!inbox.ok)
        throw new Error(data.error || "No se pudo cargar la bandeja.");
      setMessages(data.mensajes || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setPhone(dataService.getActiveUser()?.telefono_whatsapp || "");
    void refresh();
  }, []);
  return (
    <section className="rounded-2xl bg-white border border-kraft-200 p-4 space-y-3">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <h2 className="font-bold">Gestiona tu obra desde tu WhatsApp</h2>
        <span className="text-xs">
          {!status
            ? "Comprobando conexión…"
            : status.cloud_api_configurada
              ? "Configuración del servidor completa · falta comprobar el envío real"
              : "Conexión con Meta pendiente"}
        </span>
      </div>
      <p className="text-sm">
        Escribe desde tu teléfono al número de ObraTrack para cotizar, registrar
        pagos y actualizar tus obras. Tu número registrado:{" "}
        <strong>{phone || "Pendiente en tu ficha de usuario"}</strong>.
      </p>
      {status?.cloud_api_configurada && status.numero && (
        <a
          className="inline-block bg-green-700 text-white rounded-lg px-3 py-2 text-sm"
          href={`https://wa.me/${status.numero.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
        >
          Abrir WhatsApp de ObraTrack
        </a>
      )}
      <button
        className="text-sm underline ml-2"
        disabled={busy}
        onClick={refresh}
      >
        {busy ? "Actualizando…" : "Actualizar mensajes"}
      </button>
      {error && (
        <p role="status" className="text-xs text-amber-800">
          {error}
        </p>
      )}
      <p className="text-xs text-gray-600">
        Ejemplo: «Cotiza un radier de 20 m² en Maipú, de 10 cm de espesor, con
        margen del 20 %».
      </p>
      {messages.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-bold">
            Mis mensajes de WhatsApp ({messages.length})
          </summary>
          <div className="mt-3 space-y-3">
            {messages.map((m) => (
              <article key={m.message_id} className="border-t pt-3 text-sm">
                <p className="font-medium whitespace-pre-wrap">{m.texto}</p>
                <p className="whitespace-pre-wrap mt-1">{m.respuesta}</p>
                <AIMessageTools
                  message={{ cotizacion_generada: m.cotizacion || undefined }}
                />
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
