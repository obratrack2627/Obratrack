import { AIError } from "./errors";
import { isolatedState } from "@/lib/whatsapp/state";
import { summarizeBudgets } from "./operations-context";

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
export async function loadAIContext(
  client: any,
  user: any,
  options: { projectsOnly?: boolean; includeBudgets?: boolean } = {},
) {
  const [companyResult, projectResult, budgetResult] = await Promise.all([
    client.from('empresas').select('id,nombre,rut,plan_id,logo_url,configuracion').eq('id', user.empresa_id),
    client.from('proyectos').select('*').eq('empresa_id', user.empresa_id),
    options.includeBudgets && !options.projectsOnly && user.rol !== "terreno"
      ? client.from("presupuestos").select("id,empresa_id,proyecto_id,estado,nombre_alternativa,cotizacion,created_at,updated_at").eq("empresa_id", user.empresa_id).order("updated_at", {ascending:false}).limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const company = checkedRows(companyResult)[0];
  const tables: Record<string, any[]> = {
    usuarios: [],
    clientes: [],
    agenda_eventos: [],
    presupuestos: checkedRows(budgetResult),
    proyectos: checkedRows(projectResult),
  };
  const ids = tables.proyectos.map((p) => p.id);
  const names = options.projectsOnly ? (user.rol === "terreno" ? ["proyecto_trabajadores"] : []) : ["usuarios", "clientes", "agenda_eventos", ...projectTables];
  const orderProjectQuery = (table: string, query: any) => {
    if (table !== "materiales_proyecto" || typeof query?.order !== "function") return query;
    const byCreated = query.order("created_at", { ascending: true });
    return typeof byCreated?.order === "function" ? byCreated.order("id", { ascending: true }) : byCreated;
  };
  const results = await Promise.all(
    names.map((table) =>
      projectTables.includes(table)
        ? ids.length
          ? orderProjectQuery(table, client.from(table).select("*").in("proyecto_id", ids))
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
      tables[table] = (tables[table] || []).filter((r) => assigned.has(r.proyecto_id));
    tables.usuarios = [user];
    tables.clientes = [];
    tables.agenda_eventos = [];
  }
  const service = isolatedState(user, tables, company?.plan_id || "gratis");
  return {
    company,
    service,
    tables,
    context: {
      proyectos: service.getProyectos(),
      trabajadores: tables.usuarios.map(({ id, nombre, rol, email, telefono_whatsapp, rut, especialidades }) => ({
        id,
        nombre,
        rol,
        email, telefono_whatsapp, rut, especialidades: especialidades || [],
      })),
      usuario_actual: { id: user.id, nombre: user.nombre, rol: user.rol },
      clientes: tables.clientes,
      agenda: tables.agenda_eventos,
      presupuestos_guardados:
        user.rol === "terreno" ? [] : summarizeBudgets(tables.presupuestos, undefined, 8),
      rol: user.rol,
    },
  };
}
