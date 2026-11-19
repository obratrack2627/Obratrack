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

/** Conserva saltos de línea y listas en el cuerpo del mensaje interactivo de WhatsApp. */
function clipBody(value: string, max: number): string {
  const clean = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
      case "ot:menu:create_project":
        return "Quiero crear una obra nueva";
      case "ot:menu:list_projects":
        return "¿Qué obras tengo?";
      case "ot:menu:quote":
        return "Quiero hacer una cotización";
      case "ot:menu:agreed_quote":
        return "Quiero hacer una cotización pactada";
      case "ot:menu:prices":
        return "Quiero buscar precios de materiales";
      case "ot:menu:open":
        return "Menú";
      case "ot:quote:standard":
        return "Cotízalo ahora con estándar profesional y preparación básica incluida";
      case "ot:agreed:iva_inc":
        return "El precio acordado es con IVA incluido";
      case "ot:agreed:iva_net":
        return "El precio acordado es neto más IVA";
      case "ot:alt:1":
        return "1";
      case "ot:alt:2":
        return "2";
      case "ot:alt:3":
        return "3";
      case "ot:alt:4":
        return "4";
      case "ot:quote:create":
        return "Crea la obra con esta cotización";
      case "ot:quote:compare":
        return "Busca precios de los materiales de esta cotización en tiendas";
      case "ot:quote:alt":
        return "Dame otra alternativa de esta cotización";
      case "ot:draft:confirm":
        return "Sí, confirmar y crear la obra";
      case "ot:draft:cancel":
        return "Cancelar borrador";
      case "ot:team:assign":
        return "Sí";
      case "ot:team:skip":
        return "Ahora no";
      case "ot:act:menu":
        return "Acciones de esta obra";
      case "ot:act:balance":
        return "¿Cuál es el saldo por cobrar y el resumen de pagos de esta obra?";
      case "ot:act:pay_prompt":
        return "Quiero registrar un pago en esta obra; pregúntame el monto y el método de pago.";
      case "ot:act:gantt":
        return "Muéstrame las partidas, avances y fechas de esta obra";
      case "ot:act:materials":
        return "¿Qué materiales faltan por comprar en esta obra?";
      case "ot:act:mat_bought":
        return "Quiero marcar un material como comprado en esta obra; muéstrame cuáles están pendientes.";
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
        if (id.startsWith("ot:worker:")) {
          const workerId = id.slice("ot:worker:".length).trim();
          return workerId || title || null;
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

/** Detecta saludos ("Hola", "Hola obrabottt", "Buenos días", "Menú", etc.) para abrir siempre el menú interactivo. */
export function isGreetingOrMenuRequest(text: string): boolean {
  const clean = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.!?¡¿,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:hol+a+|holi+|buena+s?|bueno+s?\s+(?:dia+s?|tarde+s?|noche+s?)|buen\s+dia+|wena+s?|hey+|alo+|menu|inicio|opciones|ayuda)(?:\s+(?:obrabot+|bot+|asistente|equipo|jefe|maestro))?$/.test(
    clean,
  );
}

/** Respuesta inmediata sin llamar al LLM para opciones de menú que piden datos al usuario. */
export function directInteractiveMenuReply(batchItems: any[]): { respuesta: string } | null {
  if (!Array.isArray(batchItems) || batchItems.length !== 1) return null;
  const item = batchItems[0];
  if (item?.type !== "interactive") return null;
  const id =
    item.interactive?.type === "list_reply"
      ? item.interactive.list_reply?.id
      : item.interactive?.type === "button_reply"
        ? item.interactive.button_reply?.id
        : null;
  switch (id) {
    case "ot:menu:quote":
      return {
        respuesta:
          "Perfecto, hagamos una cotización. Cuéntame qué trabajo quieres cotizar, medidas aproximadas (m² o unidades) y la comuna, y te preparo el presupuesto con materiales, mano de obra y PDF.",
      };
    case "ot:menu:agreed_quote":
      return {
        respuesta:
          "Perfecto, preparemos una cotización pactada. Indícame el trabajo, el precio total ya acordado (con IVA incluido o + IVA), el cliente y los días estimados.",
      };
    case "ot:menu:prices":
      return {
        respuesta:
          "Dime qué material necesitas cotizar (por ejemplo: 20 sacos de cemento de 25 kg o 10 planchas de yeso cartón) y comparo precios reales en tiendas.",
      };
    case "ot:act:menu":
      return {
        respuesta: "Selecciona qué gestión deseas realizar en esta obra:",
      };
    default:
      return null;
  }
}

/**
 * Determina si una respuesta de ObraBot debe incluir botones o lista interactiva nativa de WhatsApp.
 */
export function buildWhatsAppInteractivePayload(
  result: any,
  options?: {
    role?: string;
    projects?: Array<{ id: string; nombre: string; estado?: string; comuna?: string | null }>;
    workers?: Array<{ id: string; nombre: string; rol?: string }>;
    showGreetingMenu?: boolean;
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
  const rawReply = String(result.respuesta || "");
  const normalizedReply = rawReply.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedText = String(options?.userText || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // 0. Menú principal al saludar ("Hola", "Buenos días", "Menú", etc.).
  if (options?.showGreetingMenu) {
    if (isManager) {
      return {
        kind: "list",
        body: "¡Hola! ¿Qué deseas hacer hoy en ObraTrack?",
        footer: "ObraBot · Menú principal",
        buttonText: "📋 ¿Qué hacer?",
        sectionTitle: "Opciones principales",
        rows: [
          { id: "ot:menu:quote", title: "📐 Hacer cotización", description: "Estimar materiales, mano de obra y PDF" },
          { id: "ot:menu:agreed_quote", title: "🤝 Cotización pactada", description: "Emitir cotización con precio ya acordado" },
          { id: "ot:menu:create_project", title: "🏗️ Crear obra", description: "Registrar una obra nueva paso a paso" },
          { id: "ot:menu:list_projects", title: "📂 Ver obras", description: "Listar y elegir una de tus obras" },
          { id: "ot:menu:prices", title: "🛒 Buscar precios", description: "Comparar materiales en tiendas chilenas" },
        ],
      };
    }
    return {
      kind: "buttons",
      body: "¡Hola! ¿Qué deseas hacer hoy en tu obra?",
      footer: "ObraBot · Terreno",
      buttons: [
        { id: "ot:menu:list_projects", title: "📂 Ver mis obras" },
        { id: "ot:act:progress", title: "📈 Subir avance" },
        { id: "ot:act:incident", title: "⚠️ Incidente" },
      ],
    };
  }

  // 1. Seguimiento de asignación de cuadrilla tras crear obra o cuando pide elegir trabajador.
  if (
    actions?.borrador_registro?.asignacion &&
    Array.isArray(actions.borrador_registro.asignacion.nombres) &&
    actions.borrador_registro.asignacion.nombres.length === 0 &&
    (!rawReply || /\b(?:trabajadores|jefes de obra|a quienes|indica los nombres|cuadrilla)\b/.test(normalizedReply))
  ) {
    const asksWorkerNames = /\b(?:a quienes|indica los nombres)\b/.test(normalizedReply);
    const availableWorkers = (options?.workers || []).filter((w) => w?.id && w?.nombre && w.rol !== "admin").slice(0, 10);
    if (asksWorkerNames && availableWorkers.length >= 1) {
      return {
        kind: "list",
        body: "Selecciona un integrante del equipo para asignarlo a la obra o escribe varios nombres:",
        footer: "ObraBot · Cuadrilla",
        buttonText: "👷 Elegir persona",
        sectionTitle: "Equipo disponible",
        rows: availableWorkers.map((w) => ({
          id: `ot:worker:${w.id}`,
          title: clip(w.nombre, META_LIST_ROW_TITLE_MAX),
          description: w.rol === "supervisor" ? "Jefe de obra / Supervisor" : "Trabajador de terreno",
        })),
      };
    }
    return {
      kind: "buttons",
      body: "¿Quieres asignar trabajadores o jefes de obra ahora?",
      footer: "ObraBot · Selección rápida",
      buttons: [
        { id: "ot:team:assign", title: "👷 Asignar equipo" },
        { id: "ot:team:skip", title: "⏭️ Ahora no" },
      ],
    };
  }

  // 2. Borrador de creación de obra pendiente de datos o confirmación.
  const pendingDraft = result.borrador_obra || (actions?.tipo === "solicitar_datos_obra" ? actions.detalles?.borrador : null);
  if (pendingDraft && typeof pendingDraft === "object") {
    const asksConfirmation = /\b(?:confirmas|confirmar|creo la obra|quieres que la cree|responde\s+[«"]?s[ií])\b/i.test(rawReply);
    return {
      kind: "buttons",
      body: asksConfirmation ? "¿Confirmas la creación de esta obra?" : "Puedes completar los datos o cancelar este borrador.",
      footer: "ObraBot · Creación de obra",
      buttons: asksConfirmation
        ? [
            { id: "ot:draft:confirm", title: "✅ Confirmar obra" },
            { id: "ot:draft:cancel", title: "✖️ Cancelar" },
          ]
        : [{ id: "ot:draft:cancel", title: "✖️ Cancelar" }],
    };
  }

  // 3. Cotización recién generada (con alternativas o propuesta única).
  if (result.cotizacion && !actions?.presupuesto_proyecto_id && !actions?.presupuesto_seleccion_id) {
    const alts = Array.isArray(result.cotizacion.alternativas) ? result.cotizacion.alternativas : [];
    if (alts.length >= 1) {
      const allOptions = [result.cotizacion, ...alts].slice(0, 4);
      if (allOptions.length <= 3) {
        return {
          kind: "buttons",
          body: "Elige la alternativa que quieres aprobar para crear la obra y recibir el PDF:",
          footer: "ObraBot · Alternativas",
          buttons: allOptions.map((opt, idx) => ({
            id: `ot:alt:${idx + 1}`,
            title: clip(`✅ ${opt.nombre_alternativa || `Opción ${idx + 1}`}`, META_BUTTON_TITLE_MAX),
          })),
        };
      }
      return {
        kind: "list",
        body: "Selecciona cuál de las alternativas quieres aprobar:",
        footer: "ObraBot · Alternativas",
        buttonText: "✅ Elegir opción",
        sectionTitle: "Alternativas cotizadas",
        rows: allOptions.map((opt, idx) => ({
          id: `ot:alt:${idx + 1}`,
          title: clip(`${idx + 1}. ${opt.nombre_alternativa || `Opción ${idx + 1}`}`, META_LIST_ROW_TITLE_MAX),
          description: opt.resumen_ejecutivo ? clip(opt.resumen_ejecutivo, META_LIST_ROW_DESC_MAX) : undefined,
        })),
      };
    }
    return {
      kind: "buttons",
      body: "¿Qué quieres hacer con esta cotización?",
      footer: "ObraBot · Cotizador",
      buttons: [
        { id: "ot:quote:create", title: "🏗️ Crear obra" },
        { id: "ot:quote:compare", title: "🛒 Precios retail" },
        { id: "ot:quote:alt", title: "🔄 Otra opción" },
      ],
    };
  }

  // 3b. Pregunta de IVA en cotización pactada (IVA incluido vs + IVA neto).
  if (
    isManager &&
    !result.cotizacion &&
    !actions?.tipo &&
    (/\bcotizacion pactada\b/.test(normalizedReply) ||
      (/\biva\b/.test(normalizedReply) && /\b(?:incluido|neto|mas iva|\+ iva|acordado)\b/.test(normalizedReply)))
  ) {
    return {
      kind: "buttons",
      body: "Si ya tienes el monto acordado, puedes elegir el tratamiento de IVA:",
      footer: "ObraBot · Cotización pactada",
      buttons: [
        { id: "ot:agreed:iva_inc", title: "✅ IVA incluido" },
        { id: "ot:agreed:iva_net", title: "➕ Más IVA (neto)" },
        { id: "ot:menu:open", title: "📋 Menú principal" },
      ],
    };
  }

  // 3c. Pregunta intermedia de cotización estándar.
  if (
    isManager &&
    !result.cotizacion &&
    !actions?.tipo &&
    (rawReply.includes("?") || /\b(?:necesito saber|indica(?:me)?|cuéntame|cuentame)\b/i.test(rawReply)) &&
    /\b(?:cotiz(?:ar|acion)|presupuesto)\b/i.test(rawReply) &&
    !/\b(?:que cotizacion quieres usar|no creare una obra|no puedo crear la obra|que deseas modificar|no se creara una obra)\b/.test(
      normalizedReply,
    )
  ) {
    return {
      kind: "buttons",
      body: "Puedes responder con el detalle o generar una estimación estándar inmediata:",
      footer: "ObraBot · Cotizador",
      buttons: [
        { id: "ot:quote:standard", title: "⚡ Cotizar estándar" },
        { id: "ot:menu:open", title: "📋 Menú principal" },
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
        { id: "ot:photo:progress", title: "📈 Avance de obra" },
        { id: "ot:photo:incident", title: "⚠️ Incidente" },
        { id: "ot:photo:doc", title: "🧾 Boleta / doc" },
      ],
    };
  }

  // 5. Menú rápido al seleccionar una obra desde la lista interactiva (o al tocar "Más acciones").
  if (options?.selectedProjectMenu) {
    if (isManager) {
      return {
        kind: "list",
        body: "Elige una acción rápida para esta obra o escríbeme lo que necesitas.",
        footer: "ObraBot · Gestión de obra",
        buttonText: "⚙️ Acciones",
        sectionTitle: "Acciones de obra",
        rows: [
          { id: "ot:act:balance", title: "💰 Saldo y pagos", description: "Ver cobrado y saldo por cobrar" },
          { id: "ot:act:gantt", title: "📊 Partidas y avance", description: "Ver progreso y fechas clave" },
          { id: "ot:act:materials", title: "🧱 Materiales", description: "Revisar qué falta por comprar" },
          { id: "ot:act:attendance", title: "👷 Asistencia hoy", description: "Ver cuadrilla registrada hoy" },
          { id: "ot:act:close", title: "📄 Cierre diario PDF", description: "Emitir reporte oficial de jornada" },
          { id: "ot:act:notify", title: "📢 Avisar al equipo", description: "Enviar aviso por WhatsApp" },
        ],
      };
    }
    return {
      kind: "buttons",
      body: "¿Qué quieres registrar en esta obra?",
      footer: "ObraBot · Terreno",
      buttons: [
        { id: "ot:act:progress", title: "📈 Subir avance" },
        { id: "ot:act:incident", title: "⚠️ Incidente" },
        { id: "ot:act:gantt", title: "📋 Mis partidas" },
      ],
    };
  }

  // 6. Lista interactiva de obras cuando el usuario pide ver sus obras.
  if (options?.showProjectList && Array.isArray(options.projects)) {
    const active = options.projects
      .filter((p) => p?.id && p?.nombre && p.estado !== "cancelado")
      .slice(0, 10);
    if (active.length >= 2) {
      return {
        kind: "list",
        body: "Selecciona una obra para consultarla o registrar avances.",
        footer: "ObraBot · Tus obras",
        buttonText: "📂 Elegir obra",
        sectionTitle: "Obras disponibles",
        rows: active.map((p) => ({
          id: `ot:project:${p.id}`,
          title: clip(p.nombre, META_LIST_ROW_TITLE_MAX),
          description: clip(
            [
              p.estado === "pausado" ? "⏸️ Pausada" : p.estado === "terminado" ? "✅ Terminada" : "🟢 En curso",
              p.comuna,
            ]
              .filter(Boolean)
              .join(" · "),
            META_LIST_ROW_DESC_MAX,
          ),
        })),
      };
    }
    if (active.length === 1) {
      return buildWhatsAppInteractivePayload(result, { ...options, showProjectList: false, selectedProjectMenu: true });
    }
    if (isManager) {
      return {
        kind: "buttons",
        body: "¿Quieres registrar tu primera obra o preparar una cotización?",
        footer: "ObraBot · Comenzar",
        buttons: [
          { id: "ot:menu:create_project", title: "🏗️ Crear obra" },
          { id: "ot:menu:quote", title: "📐 Hacer cotización" },
          { id: "ot:menu:open", title: "📋 Menú principal" },
        ],
      };
    }
  }

  // 7. Comparador de precios en tiendas (cuando entrega resultados o pide el material a buscar).
  if (
    result.comparacion_materiales ||
    result.comparaciones_materiales ||
    /\bferreterias consultadas\b/.test(normalizedReply)
  ) {
    return {
      kind: "buttons",
      body: "¿Qué deseas hacer ahora?",
      footer: "ObraBot · Precios retail",
      buttons: [
        { id: "ot:menu:prices", title: "🛒 Buscar otro" },
        ...(isManager ? [{ id: "ot:menu:quote", title: "📐 Hacer cotización" }] : []),
        { id: "ot:menu:open", title: "📋 Menú principal" },
      ],
    };
  }

  // 8. Sub-flujos de gestión dentro de una obra activa.
  if (actions?.proyecto_contexto_id) {
    const actionType = actions?.tipo;

    // 8a. Para terreno: después de consultar partidas o registrar avance/incidente
    if (!isManager) {
      return {
        kind: "buttons",
        body: "Acciones rápidas en tu obra:",
        footer: "ObraBot · Terreno",
        buttons: [
          { id: "ot:act:progress", title: "📈 Subir avance" },
          { id: "ot:act:incident", title: "⚠️ Incidente" },
          { id: "ot:act:gantt", title: "📋 Mis partidas" },
        ],
      };
    }

    // 8b. Tras registrar avance o bitácora (jefatura)
    if (actionType === "actualizar_avance" || actionType === "crear_bitacora") {
      return {
        kind: "buttons",
        body: "¿Quieres emitir el cierre diario o revisar pendientes?",
        footer: "ObraBot · Siguiente paso",
        buttons: [
          { id: "ot:act:close", title: "📄 Cierre diario PDF" },
          { id: "ot:act:gantt", title: "📊 Ver pendientes" },
          { id: "ot:act:menu", title: "⚙️ Más acciones" },
        ],
      };
    }

    // 8c. Tras emitir el cierre diario
    if (actionType === "registrar_documento" || /\bcierre de jornada guardado\b/.test(normalizedReply)) {
      return {
        kind: "buttons",
        body: "¿Qué deseas hacer después del cierre?",
        footer: "ObraBot · Cierre diario",
        buttons: [
          { id: "ot:act:notify", title: "📢 Avisar al equipo" },
          { id: "ot:menu:list_projects", title: "📂 Ver obras" },
          { id: "ot:menu:open", title: "📋 Menú principal" },
        ],
      };
    }

    // 8d. Consulta o registro de asistencia
    if (actionType === "registrar_asistencia" || (!actionType && /\basistencia\b/.test(normalizedText))) {
      return {
        kind: "buttons",
        body: "Acciones rápidas de asistencia:",
        footer: "ObraBot · Cuadrilla",
        buttons: [
          { id: "ot:act:attendance_all", title: "✅ Todos presentes" },
          { id: "ot:act:gantt", title: "📊 Ver partidas" },
          { id: "ot:act:menu", title: "⚙️ Más acciones" },
        ],
      };
    }

    // 8e. Consulta o registro de materiales
    if (
      actionType === "agregar_material" ||
      actionType === "actualizar_material" ||
      (!actionType && /\bmaterial(?:es)?\b/.test(normalizedText) && /\b(?:falta|pendiente|comprar|lista)\b/.test(normalizedText))
    ) {
      return {
        kind: "buttons",
        body: "Acciones rápidas de materiales:",
        footer: "ObraBot · Compras",
        buttons: [
          { id: "ot:act:compare", title: "🛒 Buscar precios" },
          { id: "ot:act:mat_bought", title: "✅ Marcar comprado" },
          { id: "ot:act:menu", title: "⚙️ Más acciones" },
        ],
      };
    }

    // 8f. Consulta de saldo / pagos o registro de pago
    if (
      actionType === "registrar_pago" ||
      (!actionType && /\b(?:saldo|cobrar|pagos?|recaudado|abono)\b/.test(normalizedText))
    ) {
      return {
        kind: "buttons",
        body: "Acciones rápidas de finanzas:",
        footer: "ObraBot · Finanzas",
        buttons: [
          { id: "ot:act:pay_prompt", title: "💵 Registrar pago" },
          { id: "ot:act:gantt", title: "📊 Ver partidas" },
          { id: "ot:act:menu", title: "⚙️ Más acciones" },
        ],
      };
    }

    // 8g. Consulta de partidas / Gantt / avance
    if (!actionType && /\b(?:partidas?|avance|gantt|fechas?|plazos?)\b/.test(normalizedText)) {
      return {
        kind: "buttons",
        body: "Acciones rápidas de planificación:",
        footer: "ObraBot · Carta Gantt",
        buttons: [
          { id: "ot:act:progress", title: "📈 Subir avance" },
          { id: "ot:act:close", title: "📄 Cierre diario PDF" },
          { id: "ot:act:menu", title: "⚙️ Más acciones" },
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
  const bodyText = clipBody(bodyOverride || payload.body, META_BODY_MAX);
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
