export interface WhatsAppInteractiveButton {
  id: string;
  title: string;
}

export interface WhatsAppInteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export type WhatsAppInteractivePayload =
  | {
      kind: "buttons";
      body: string;
      footer?: string;
      buttons: WhatsAppInteractiveButton[];
    }
  | {
      kind: "list";
      body: string;
      footer?: string;
      buttonText: string;
      sectionTitle: string;
      rows: WhatsAppInteractiveListRow[];
    };

const META_BODY_MAX = 1024;
const META_FOOTER_MAX = 60;
const META_BUTTON_TITLE_MAX = 20;
const META_LIST_BUTTON_MAX = 20;
const META_LIST_SECTION_MAX = 24;
const META_LIST_ROW_TITLE_MAX = 24;
const META_LIST_ROW_DESC_MAX = 72;

function clip(value: string, max: number): string {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Traduce un toque en botón o lista interactiva de WhatsApp Cloud API
 * a una instrucción determinista que ObraBot procesa sin ambigüedad.
 */
export function parseWhatsAppInteractiveReply(item: any): string | null {
  if (!item || typeof item !== "object") return null;

  if (item.type === "interactive" && item.interactive) {
    const reply =
      item.interactive.type === "button_reply"
        ? item.interactive.button_reply
        : item.interactive.type === "list_reply"
          ? item.interactive.list_reply
          : null;
    if (!reply) return null;

    const id = typeof reply.id === "string" ? reply.id.trim() : "";
    const title = typeof reply.title === "string" ? reply.title.trim() : "";

    switch (id) {
      case "ot:quote:create":
        return "Crea la obra con esta cotización";
      case "ot:quote:compare":
        return "Busca precios de los materiales de esta cotización en tiendas";
      case "ot:quote:alt":
        return "Dame otra alternativa de esta cotización";
      case "ot:draft:confirm":
        return "Sí, confirmar y crear la obra";
      case "ot:draft:cancel":
        return "Cancelar creación de obra";
      case "ot:team:assign":
        return "Sí";
      case "ot:team:skip":
        return "Ahora no";
      case "ot:act:balance":
        return "¿Cuál es el saldo por cobrar y el resumen de pagos de esta obra?";
      case "ot:act:gantt":
        return "Muéstrame las partidas, avances y fechas de esta obra";
      case "ot:act:materials":
        return "¿Qué materiales faltan por comprar en esta obra?";
      case "ot:act:attendance":
        return "Muéstrame la asistencia de hoy en esta obra";
      case "ot:act:attendance_all":
        return "Marca a todos los trabajadores asignados como presentes hoy en esta obra";
      case "ot:act:close":
        return "Haz el cierre diario de hoy de esta obra";
      case "ot:act:notify":
        return "Quiero enviar un aviso al equipo de esta obra; pregúntame qué mensaje enviar.";
      case "ot:act:progress":
        return "Quiero registrar un avance en esta obra; pregúntame qué partida y porcentaje.";
      case "ot:act:incident":
        return "Quiero reportar un incidente en esta obra; pregúntame el detalle.";
      case "ot:act:compare":
        return "Busca precios en tiendas para los materiales pendientes de esta obra";
      case "ot:photo:progress":
        return "Registra la foto anterior como avance de obra";
      case "ot:photo:incident":
        return "Registra la foto anterior como incidente o falla en obra";
      case "ot:photo:doc":
        return "Registra la foto anterior como boleta o documento de obra";
      default:
        if (id.startsWith("ot:project:")) {
          const projectName = title || id.slice("ot:project:".length);
          return projectName ? `Trabajar en la obra ${projectName}` : null;
        }
        return title || id || null;
    }
  }

  if (item.type === "button" && item.button) {
    const text = typeof item.button.text === "string" ? item.button.text.trim() : "";
    const payload = typeof item.button.payload === "string" ? item.button.payload.trim() : "";
    return text || payload || null;
  }

  return null;
}

/**
 * Determina si una respuesta de ObraBot debe incluir botones o lista interactiva nativa de WhatsApp.
 */
export function buildWhatsAppInteractivePayload(
  result: any,
  options?: {
    role?: string;
    projects?: Array<{ id: string; nombre: string; estado?: string; comuna?: string | null }>;
    showProjectList?: boolean;
    selectedProjectMenu?: boolean;
    ambiguousPhoto?: boolean;
    userText?: string;
  },
): WhatsAppInteractivePayload | null {
  if (!result || typeof result !== "object") return null;
  const actions = result.acciones || {};
  const role = options?.role || actions?.rol_actor || "admin";
  const isManager = role === "admin" || role === "supervisor";

  // 1. Seguimiento opcional de asignación de cuadrilla tras crear obra.
  if (
    actions?.borrador_registro?.asignacion &&
    Array.isArray(actions.borrador_registro.asignacion.nombres) &&
    actions.borrador_registro.asignacion.nombres.length === 0
  ) {
    return {
      kind: "buttons",
      body: "¿Quieres asignar trabajadores o jefes de obra ahora?",
      footer: "ObraBot · Selección rápida",
      buttons: [
        { id: "ot:team:assign", title: "Asignar cuadrilla" },
        { id: "ot:team:skip", title: "Ahora no" },
      ],
    };
  }

  // 2. Borrador de creación de obra pendiente de datos o confirmación.
  const pendingDraft = result.borrador_obra || (actions?.tipo === "solicitar_datos_obra" ? actions.detalles?.borrador : null);
  if (pendingDraft && typeof pendingDraft === "object") {
    const responseText = String(result.respuesta || "");
    const asksConfirmation = /\b(?:confirmas|confirmar|creo la obra|quieres que la cree|responde\s+[«"]?s[ií])\b/i.test(responseText);
    return {
      kind: "buttons",
      body: asksConfirmation ? "¿Confirmas la creación de esta obra?" : "Puedes completar los datos o cancelar este borrador.",
      footer: "ObraBot · Creación de obra",
      buttons: asksConfirmation
        ? [
            { id: "ot:draft:confirm", title: "Confirmar obra" },
            { id: "ot:draft:cancel", title: "Cancelar" },
          ]
        : [{ id: "ot:draft:cancel", title: "Cancelar" }],
    };
  }

  // 3. Cotización recién generada (sin haber sido convertida en este turno).
  if (result.cotizacion && !actions?.presupuesto_proyecto_id && !actions?.presupuesto_seleccion_id) {
    return {
      kind: "buttons",
      body: "¿Qué quieres hacer con esta cotización?",
      footer: "ObraBot · Cotizador",
      buttons: [
        { id: "ot:quote:create", title: "Crear obra" },
        { id: "ot:quote:compare", title: "Ver precios retail" },
        { id: "ot:quote:alt", title: "Otra alternativa" },
      ],
    };
  }

  // 4. Foto enviada sin texto descriptivo: clasificación rápida en 1 toque.
  if (options?.ambiguousPhoto) {
    return {
      kind: "buttons",
      body: "¿Cómo quieres clasificar esta foto?",
      footer: "ObraBot · Evidencias",
      buttons: [
        { id: "ot:photo:progress", title: "Avance de obra" },
        { id: "ot:photo:incident", title: "Incidente / falla" },
        { id: "ot:photo:doc", title: "Boleta / documento" },
      ],
    };
  }

  // 5. Menú rápido al seleccionar una obra desde la lista interactiva.
  if (options?.selectedProjectMenu) {
    if (isManager) {
      return {
        kind: "list",
        body: "Elige una acción rápida para esta obra o escríbeme lo que necesitas.",
        footer: "ObraBot · Gestión de obra",
        buttonText: "Acciones",
        sectionTitle: "Acciones de obra",
        rows: [
          { id: "ot:act:balance", title: "Saldo y pagos", description: "Ver cobrado y saldo por cobrar" },
          { id: "ot:act:gantt", title: "Partidas y avance", description: "Ver progreso y fechas clave" },
          { id: "ot:act:materials", title: "Materiales pendientes", description: "Revisar qué falta por comprar" },
          { id: "ot:act:attendance", title: "Asistencia de hoy", description: "Ver cuadrilla registrada hoy" },
          { id: "ot:act:close", title: "Cierre diario (PDF)", description: "Emitir reporte oficial de jornada" },
          { id: "ot:act:notify", title: "Avisar al equipo", description: "Enviar aviso por WhatsApp" },
        ],
      };
    }
    return {
      kind: "buttons",
      body: "¿Qué quieres registrar en esta obra?",
      footer: "ObraBot · Terreno",
      buttons: [
        { id: "ot:act:progress", title: "Subir avance" },
        { id: "ot:act:incident", title: "Reportar incidente" },
        { id: "ot:act:gantt", title: "Mis partidas" },
      ],
    };
  }

  // 6. Lista interactiva de obras cuando el usuario lista sus obras o entra sin obra activa.
  if (options?.showProjectList && Array.isArray(options.projects)) {
    const active = options.projects
      .filter((p) => p?.id && p?.nombre && p.estado !== "cancelado")
      .slice(0, 10);
    if (active.length >= 2) {
      return {
        kind: "list",
        body: "Selecciona una obra para consultarla o registrar avances.",
        footer: "ObraBot · Tus obras",
        buttonText: "Elegir obra",
        sectionTitle: "Obras disponibles",
        rows: active.map((p) => ({
          id: `ot:project:${p.id}`,
          title: clip(p.nombre, META_LIST_ROW_TITLE_MAX),
          description: clip(
            [p.estado === "pausado" ? "Pausada" : p.estado === "terminado" ? "Terminada" : "En curso", p.comuna]
              .filter(Boolean)
              .join(" · "),
            META_LIST_ROW_DESC_MAX,
          ),
        })),
      };
    }
  }

  // 7. Acciones rápidas contextuales para jefatura tras avances, asistencia o materiales.
  if (isManager && actions?.proyecto_contexto_id) {
    const actionType = actions?.tipo;
    const normalizedText = String(options?.userText || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (actionType === "actualizar_avance" || actionType === "crear_bitacora") {
      return {
        kind: "buttons",
        body: "¿Quieres emitir el cierre diario o revisar pendientes?",
        footer: "ObraBot · Siguiente paso",
        buttons: [
          { id: "ot:act:close", title: "Cierre diario PDF" },
          { id: "ot:act:gantt", title: "Ver pendientes" },
        ],
      };
    }

    if (!actionType && /\basistencia\b/.test(normalizedText)) {
      return {
        kind: "buttons",
        body: "Acciones rápidas de asistencia:",
        footer: "ObraBot · Cuadrilla",
        buttons: [
          { id: "ot:act:attendance_all", title: "Todos presentes" },
          { id: "ot:act:gantt", title: "Ver partidas" },
        ],
      };
    }

    if (!actionType && /\bmaterial(?:es)?\b/.test(normalizedText) && /\b(?:falta|pendiente|comprar|lista)\b/.test(normalizedText)) {
      return {
        kind: "buttons",
        body: "Acciones rápidas de materiales:",
        footer: "ObraBot · Compras",
        buttons: [
          { id: "ot:act:compare", title: "Buscar precios" },
          { id: "ot:act:balance", title: "Ver saldo obra" },
        ],
      };
    }
  }

  return null;
}

/** Construye el cuerpo JSON estricto exigido por Meta Cloud API para mensajes interactivos. */
export function buildMetaInteractiveRequestBody(
  to: string,
  payload: WhatsAppInteractivePayload,
  bodyOverride?: string,
) {
  const bodyText = clip(bodyOverride || payload.body, META_BODY_MAX);
  const footer = payload.footer ? { text: clip(payload.footer, META_FOOTER_MAX) } : undefined;

  if (payload.kind === "buttons") {
    const buttons = payload.buttons.slice(0, 3).map((b) => ({
      type: "reply" as const,
      reply: {
        id: b.id.slice(0, 256),
        title: clip(b.title, META_BUTTON_TITLE_MAX),
      },
    }));
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        ...(footer ? { footer } : {}),
        action: { buttons },
      },
    };
  }

  const rows = payload.rows.slice(0, 10).map((r) => ({
    id: r.id.slice(0, 200),
    title: clip(r.title, META_LIST_ROW_TITLE_MAX),
    ...(r.description ? { description: clip(r.description, META_LIST_ROW_DESC_MAX) } : {}),
  }));

  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      ...(footer ? { footer } : {}),
      action: {
        button: clip(payload.buttonText, META_LIST_BUTTON_MAX),
        sections: [
          {
            title: clip(payload.sectionTitle, META_LIST_SECTION_MAX),
            rows,
          },
        ],
      },
    },
  };
}
