import { AIError } from "./errors";
import { isolatedState } from "@/lib/whatsapp/state";

export const projectTables = [
  "actividades",
  "materiales_proyecto",
  "pagos",
  "bitacora_entradas",
  "imprevistos",
  "asistencia_obreros",
  "reclamos_cambios_obra",
  "documentos_obra",
  "proyecto_trabajadores",
];
export function checkedRows(result: any): any[] {
  if (result.error)
    throw new AIError(
      "DATABASE_READ",
      "No se pudo cargar la información de tus obras. Intenta nuevamente.",
      503,
    );
  return result.data || [];
}

// El servidor usa datos actuales y permisos de la sesión, nunca el inventario enviado por el navegador.
export async function loadAIContext(client: any, user: any) {
  const company = checkedRows(
    await client
      .from("empresas")
      .select("id,plan_id")
      .eq("id", user.empresa_id),
  )[0];
  const tables: Record<string, any[]> = {};
  tables.proyectos = checkedRows(
    await client
      .from("proyectos")
      .select("*")
      .eq("empresa_id", user.empresa_id),
  );
  const ids = tables.proyectos.map((p) => p.id);
  const names = ["usuarios", "clientes", "agenda_eventos", ...projectTables];
  const results = await Promise.all(
    names.map((table) =>
      projectTables.includes(table)
        ? ids.length
          ? client.from(table).select("*").in("proyecto_id", ids)
          : Promise.resolve({ data: [] })
        : client.from(table).select("*").eq("empresa_id", user.empresa_id),
    ),
  );
  names.forEach((table, i) => {
    tables[table] = checkedRows(results[i]);
  });
  if (user.rol === "terreno") {
    const assigned = new Set(
      tables.proyecto_trabajadores
        .filter((r) => r.usuario_id === user.id)
        .map((r) => r.proyecto_id),
    );
    tables.proyectos = tables.proyectos.filter((p) => assigned.has(p.id));
    for (const table of projectTables)
      tables[table] = tables[table].filter((r) => assigned.has(r.proyecto_id));
    tables.usuarios = [user];
    tables.clientes = [];
    tables.agenda_eventos = [];
  }
  const service = isolatedState(user, tables, company?.plan_id || "gratis");
  return {
    service,
    tables,
    context: {
      proyectos: service.getProyectos(),
      trabajadores: tables.usuarios.map(({ id, nombre, rol }) => ({
        id,
        nombre,
        rol,
      })),
      clientes: tables.clientes,
      agenda: tables.agenda_eventos,
      rol: user.rol,
    },
  };
}
