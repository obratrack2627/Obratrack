import { registrationFields, type PersonDraft } from "@/lib/registrations";
import { canonicalPhone, phonesInText } from "@/lib/phone";
import {
  anotherTask,
  personLiterals,
  personStart,
} from "@/lib/ai/person-literals";
import { resolveEntity } from "@/lib/ai/actions";
import { validarRutChileno } from "@/lib/utils";
const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export type PersonIntakeDraft = { items: PersonDraft[] };
const personActions = new Set([
  "crear_cliente",
  "agregar_trabajador",
  "agregar_trabajadores",
]);
export function personIntake(
  actions: any[],
  proposal: any,
  previous: PersonIntakeDraft | null,
  message: string,
  projects: any[],
  selectedId?: string,
  users: any[] = [],
) {
  if (anotherTask(message, previous?.items[0]?.nombre))
    return {
      actions: actions.filter((action) => !personActions.has(action.tipo)),
      draft: previous,
      question: null,
      result: null,
    };
  const creations = actions
    .filter((action) => personActions.has(action.tipo))
    .flatMap((action) =>
      action.tipo === "agregar_trabajadores"
        ? action.trabajadores.map((worker: any) => ({
            ...worker,
            tipo: "trabajador",
          }))
        : [
            {
              ...action,
              tipo: action.tipo === "crear_cliente" ? "cliente" : "trabajador",
            },
          ],
    );
  if (
    previous &&
    /^(?:cancel(?:a|ar)|olvida(?:r)?|descarta(?:r)?)(?: el registro| al trabajador| el cliente| eso)?[.!]?$/i.test(
      message.trim(),
    )
  )
    return {
      actions: [],
      draft: null,
      question: "Registro cancelado. No se creó ninguna ficha.",
      result: null,
    };
  if (!proposal && !creations.length) {
    const current =
      previous?.items.find((item) => registrationFields(item).missing.length) ||
      (previous?.items.length === 1 ? previous.items[0] : undefined);
    const value = message.trim();
    if (current) {
      if (
        validarRutChileno(value) &&
        /^[\d.kK-]+$/.test(value) &&
        (!canonicalPhone(value) ||
          /[.kK-]/.test(value) ||
          (!current.rut && !!current.telefono))
      )
        proposal = { tipo: current.tipo, rut: value };
      else if (/^[^\s@]+@[^\s@]+$/.test(value))
        proposal = { tipo: current.tipo, email: value };
      else if (canonicalPhone(value) && /^[+\d ().-]+$/.test(value))
        proposal = { tipo: current.tipo, telefono: value };
      else if (["supervisor", "terreno", "maestro"].includes(norm(value)))
        proposal = {
          tipo: current.tipo,
          rol: norm(value) === "maestro" ? "terreno" : norm(value),
        };
    } else {
      const words = norm(message).split(/\s+/);
      let index = words.findIndex((word) =>
        ["agrega", "anade", "registra", "crea"].includes(word),
      );
      if (index >= 0) {
        index++;
        while (
          [
            "a",
            "al",
            "el",
            "la",
            "un",
            "una",
            "nuevo",
            "nueva",
            "los",
            "las",
          ].includes(words[index])
        )
          index++;
        if (
          ["cliente", "trabajador", "maestro", "supervisor"].includes(
            words[index],
          )
        )
          proposal = {
            tipo: words[index] === "cliente" ? "cliente" : "trabajador",
          };
      }
    }
  }
  const incompletePerson =
    previous?.items.find((item) => registrationFields(item).missing.length) ||
    (previous?.items.length === 1 ? previous.items[0] : undefined);
  const literalFields = personLiterals(
    message,
    incompletePerson,
    projects,
    selectedId,
  );
  if (literalFields && creations.length <= 1) {
    proposal = {
      ...(creations[0] || {}),
      ...(proposal || {}),
      ...literalFields,
    };
    // Un RUT aislado que se estaba solicitando no es un nuevo teléfono.
    if (
      proposal.rut === message.trim() &&
      validarRutChileno(message.trim()) &&
      /^[\d.kK-]+$/.test(message.trim()) &&
      incompletePerson &&
      !incompletePerson.rut
    ) {
      proposal.rut = message.trim();
      delete proposal.telefono;
    }
  }
  if (!creations.length && !proposal)
    return { actions, draft: previous, question: null, result: null };
  const items: PersonDraft[] =
    previous?.items.map((item) => ({ ...item })) || [];
  const supplied = proposal ? [proposal] : creations;
  for (const input of supplied) {
    if (!["trabajador", "cliente"].includes(input.tipo)) continue;
    let index = items.findIndex(
      (item) =>
        item.tipo === input.tipo &&
        (!input.rut ||
          !item.rut ||
          input.rut.replace(/[.-]/g, "") === item.rut.replace(/[.-]/g, "")) &&
        (input.nombre
          ? norm(item.nombre || "") === norm(input.nombre)
          : registrationFields(item).missing.length > 0),
    );
    if (
      index < 0 &&
      previous?.items.length === 1 &&
      items.length === 1 &&
      items[0].tipo === input.tipo &&
      (!personStart(message) ||
        !items[0].nombre ||
        norm(items[0].nombre) === norm(input.nombre || ""))
    )
      index = 0;
    if (index < 0) {
      items.push({ tipo: input.tipo });
      index = items.length - 1;
    }
    const current = items[index];
    const literal = norm(
      message
        .split(/\s+/)
        .join(" ")
        .replaceAll(" arroba ", "@")
        .replaceAll(" punto ", "."),
    );
    for (const field of [
      "nombre",
      "rut",
      "telefono",
      "email",
      "rol",
      "direccion",
      "comuna",
    ] as const) {
      if (typeof input[field] !== "string" || !input[field].trim()) continue;
      const value = input[field].trim();
      const known = norm(value) === norm(current[field] || "");
      const phone =
        field === "telefono" &&
        phonesInText(message).includes(canonicalPhone(value));
      const role =
        field === "rol" &&
        value === "terreno" &&
        /\b(maestro|trabajador|terreno)\b/.test(literal);
      const rut =
        field === "rut" &&
        literal.replace(/[.-]/g, "").includes(norm(value).replace(/[.-]/g, ""));
      if (known || phone || role || rut || literal.includes(norm(value)))
        current[field] = value;
    }
    if (input.proyecto_id || input.proyecto_nombre) {
      try {
        const project = resolveEntity(
          projects,
          input.proyecto_id || input.proyecto_nombre,
        );
        if (
          current.proyecto_id === project.id ||
          literal.includes(norm(project.nombre)) ||
          (project.id === selectedId &&
            /\b(esta obra|esta misma obra|este proyecto|obra actual)\b/.test(
              literal,
            ))
        ) {
          current.proyecto_id = project.id;
          current.proyecto_nombre = project.nombre;
        }
      } catch {
        /* Preguntar por la obra; nunca elegir una ajena o ambigua. */
      }
    }
  }
  const validated = items.map((item) => registrationFields(item));
  const incomplete = validated.find((item) => item.missing.length);
  if (incomplete) {
    const question = `Para registrar ${incomplete.draft.nombre || (incomplete.draft.tipo === "cliente" ? "al cliente" : "al trabajador")} falta:\n${incomplete.missing.map((field) => "• " + field).join("\n")}\nPuedes responder estos datos juntos o uno por uno.`;
    const draft = { items: validated.map((item) => item.draft) };
    return {
      actions: [],
      draft,
      question,
      result: {
        tipo: "solicitar_datos_persona" as const,
        titulo: "Datos para el registro",
        resultado_texto: question,
        detalles: { borrador_registro: draft },
      },
    };
  }
  const cleanRut = (value: string) =>
    value.replace(/[.\s-]/g, "").toUpperCase();
  for (const { draft } of validated)
    if (draft.tipo === "trabajador") {
      const existing = users.find(
        (user) =>
          user.rut && draft.rut && cleanRut(user.rut) === cleanRut(draft.rut),
      );
      if (
        existing &&
        (norm(existing.nombre) !== norm(draft.nombre || "") ||
          canonicalPhone(existing.telefono_whatsapp || "") !==
            canonicalPhone(draft.telefono || "") ||
          norm(existing.email || "") !== norm(draft.email || "") ||
          existing.rol !== draft.rol)
      ) {
        return {
          actions: [],
          draft: null,
          question: `Ese RUT ya está registrado en la ficha de ${existing.nombre}. ¿Quieres editar sus datos o solo asignarlo a una obra? No creé otro trabajador.`,
          result: null,
        };
      }
    }
  const ready = validated.flatMap(({ draft }) => {
    const { tipo, proyecto_id, proyecto_nombre, ...data } = draft;
    const existing =
      tipo === "trabajador"
        ? users.find(
            (user) =>
              user.rut &&
              draft.rut &&
              cleanRut(user.rut) === cleanRut(draft.rut),
          )
        : null;
    return tipo === "cliente"
      ? [{ tipo: "crear_cliente", ...data }]
      : [
          ...(!existing ? [{ tipo: "agregar_trabajador", ...data }] : []),
          ...(proyecto_id
            ? [
                {
                  tipo: "asignar_trabajador",
                  proyecto_id,
                  trabajador_nombre: existing?.nombre || draft.nombre,
                  rut: draft.rut,
                },
              ]
            : []),
        ];
  });
  return {
    actions: [...actions.filter((a) => !personActions.has(a.tipo)), ...ready],
    draft: null,
    prepared: { items: validated.map((item) => item.draft) },
    question: ready.length
      ? null
      : "Esta persona ya está registrada. ¿Quieres editar su ficha o asignarla a una obra?",
    result: null,
  };
}
