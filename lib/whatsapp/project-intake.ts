import { canonicalPhone } from "./meta";
import { resolveEntity } from "@/lib/ai/actions";
import { AIError } from "@/lib/ai/errors";
import type { AccionAsistenteIA } from "@/types/database";
const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const text = (v: unknown): v is string =>
  typeof v === "string" && Boolean(v.trim());

export function projectIntake(
  user: any,
  proposal: any,
  previous: any,
  clients: any[],
  userText: string,
) {
  if (!["admin", "supervisor"].includes(user.rol))
    throw new AIError(
      "ACTION_FORBIDDEN",
      "Tu perfil no puede crear obras.",
      403,
    );
  const draft: Record<string, any> = { ...(previous || {}) };
  const stringFields = [
    "nombre",
    "cliente_nombre",
    "cliente_id",
    "cliente_email",
    "cliente_telefono",
    "comuna",
    "direccion",
    "descripcion",
    "fecha_inicio",
  ];
  for (const key of stringFields)
    if (text(proposal?.[key])) draft[key] = proposal[key].trim();
  for (const key of ["monto_cotizado", "dias"])
    if (typeof proposal?.[key] === "number" && Number.isFinite(proposal[key]))
      draft[key] = proposal[key];
  if (typeof proposal?.monto === "number" && Number.isFinite(proposal.monto))
    draft.monto_cotizado = proposal.monto;
  if (Array.isArray(proposal?.partidas) && proposal.partidas.length)
    draft.partidas = proposal.partidas;
  if (!draft.partidas?.length) delete draft.partidas;
  if (!Number.isInteger(draft.dias) || draft.dias <= 0) delete draft.dias;

  // Conservar los valores literales etiquetados aunque el modelo omita un campo.
  const literalText = userText
    .replace(/\s+arroba\s+/gi, "@")
    .replace(/\s+punto\s+/gi, ".");
  const email = Array.from(
    literalText.matchAll(
      /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    ),
  ).at(-1)?.[0];
  if (email) draft.cliente_email = email;
  const phone = Array.from(
    userText.matchAll(
      /\b(?:tel[eé]fono|celular|whatsapp|fono)\s*(?:del cliente\s*)?[:=]?\s*(\+?\d[\d ().-]{6,20}\d)/gi,
    ),
  ).at(-1)?.[1];
  if (phone && canonicalPhone(phone))
    draft.cliente_telefono = "+" + canonicalPhone(phone);
  const budget = Array.from(
    userText.matchAll(
      /\bpresupuesto\s*(?:(?:de|es)\s*)?[:=]?\s*\$?\s*(\d+(?:[.,]\d+)*)(?:\s*(mill[oó]n(?:es)?|mil)\b)?/gi,
    ),
  ).at(-1);
  if (budget) {
    const multiplier = budget[2]
      ? /^mil$/i.test(budget[2])
        ? 1000
        : 1000000
      : 1;
    const value =
      multiplier === 1
        ? Number(budget[1].replace(/[.,]/g, ""))
        : Number(budget[1].replace(",", ".")) * multiplier;
    if (Number.isSafeInteger(value) && value > 0) draft.monto_cotizado = value;
  }
  if (!text(draft.cliente_nombre)) {
    const name = Array.from(
      userText.matchAll(
        /\b(?:nombre del cliente|cliente(?:\s+es)?)\s*[:=]?\s*([^,;\n]+)/gi,
      ),
    )
      .at(-1)?.[1]
      ?.trim();
    if (name)
      draft.cliente_nombre = name
        .split(/\s+(?:presupuesto|email|correo|tel[eé]fono)\b/i)[0]
        .trim()
        .slice(0, 150);
  }
  let client: any;
  if (draft.cliente_id || draft.cliente_nombre) {
    try {
      client = resolveEntity(clients, draft.cliente_id || draft.cliente_nombre);
    } catch {}
  }
  if (client) {
    draft.cliente_id = client.id;
    draft.cliente_nombre = client.nombre;
    draft.cliente_email ||= client.email;
    draft.cliente_telefono ||= client.telefono;
  }
  // No aceptar contactos inventados por la IA. Los datos ya pedidos se conservan en el borrador.
  for (const key of ["nombre", "cliente_nombre", "cliente_email"]) {
    const native =
      key === "cliente_nombre"
        ? client?.nombre
        : key === "cliente_email"
          ? client?.email
          : null;
    if (
      text(draft[key]) &&
      norm(draft[key]) !== norm(String(previous?.[key] || "")) &&
      norm(draft[key]) !== norm(String(native || "")) &&
      !norm(
        key === "cliente_email"
          ? userText
              .replace(/\s+arroba\s+/gi, "@")
              .replace(/\s+punto\s+/gi, ".")
          : userText,
      ).includes(norm(draft[key]))
    )
      delete draft[key];
  }
  if (!text(draft.nombre)) {
    const named = Array.from(
      userText.matchAll(
        /\b(?:obra\s+(?:llamada|denominada)|nombre de (?:la )?obra)\s*[:=-]?\s*([^,;\n]+)/gi,
      ),
    ).at(-1)?.[1];
    if (named)
      draft.nombre = named
        .replace(/^[\s"'«»]+|[\s"'«».!?]+$/g, "")
        .split(/\s+(?:presupuesto|por \$|con presupuesto)\b/i)[0]
        .trim()
        .slice(0, 150);
  }
  if (text(draft.cliente_telefono)) {
    const phone = canonicalPhone(draft.cliente_telefono);
    const known = [previous?.cliente_telefono, client?.telefono].some(
      (p) => p && canonicalPhone(p) === phone,
    );
    const inText = (userText.match(/\+?[\d][\d\s().-]{6,20}\d/g) || []).some(
      (p) => canonicalPhone(p) === phone,
    );
    if (!phone || (!known && !inText)) delete draft.cliente_telefono;
    else draft.cliente_telefono = "+" + phone;
  }
  const missing: string[] = [];
  if (!text(draft.cliente_nombre)) missing.push("Nombre del cliente");
  if (!text(draft.nombre)) missing.push("Nombre de la obra");
  if (
    typeof draft.monto_cotizado !== "number" ||
    !Number.isFinite(draft.monto_cotizado) ||
    draft.monto_cotizado <= 0
  )
    missing.push("Presupuesto de la obra en CLP");
  if (
    !text(draft.cliente_email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.cliente_email)
  )
    missing.push("Correo electrónico del cliente");
  if (!draft.cliente_telefono)
    missing.push("Teléfono del cliente con código de país");
  if (missing.length) {
    const question =
      "Para crear la obra necesito estos datos:\n" +
      missing.map((s) => "• " + s).join("\n") +
      "\nLos demás datos son opcionales. Puedes responderlos juntos o uno por uno.";
    const result: AccionAsistenteIA = {
      tipo: "solicitar_datos_obra",
      titulo: "Datos pendientes para crear la obra",
      detalles: { borrador: draft },
      resultado_texto: question,
    };
    return { draft, question, result, actions: [] };
  }
  const actions: any[] = [];
  if (
    client &&
    (client.email !== draft.cliente_email ||
      canonicalPhone(client.telefono || "") !==
        canonicalPhone(draft.cliente_telefono))
  )
    actions.push({
      tipo: "actualizar_cliente",
      cliente_id: client.id,
      nombre: client.nombre,
      email: draft.cliente_email,
      telefono: draft.cliente_telefono,
    });
  actions.push({ tipo: "crear_proyecto", ...draft });
  return { draft, question: null, result: null, actions };
}
