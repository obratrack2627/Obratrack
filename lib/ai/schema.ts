import { ACTION_TYPES } from "./protocol";

const string = { type: "string" };
const number = { type: "number" };
const strings = (names: string) =>
  Object.fromEntries(names.split(",").map((name) => [name, string]));
const numbers = (names: string) =>
  Object.fromEntries(names.split(",").map((name) => [name, number]));
const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: Record<string, unknown>) => ({ type: "array", items });
const activity = object({ nombre: string, dias: number }, ["nombre", "dias"]);
const material = object(
  {
    ...strings("nombre,unidad,categoria,proveedor,actividad_id"),
    ...numbers("cantidad,precio_unitario"),
  },
  ["nombre", "cantidad", "precio_unitario"],
);

const materialQuery = {
  ...object(
    {
      ...strings(
        "producto,marca,modelo,presentacion,ubicacion,unidad_cantidad",
      ),
      cantidad: number,
      unidad_cantidad: { type: ["string", "null"] },
      tiendas: array(string),
    },
    ["producto", "unidad_cantidad"],
  ),
  type: ["object", "null"],
};

// Cada acción contiene solo su contrato; el servidor sigue siendo autoritativo.
const actionProperties: Record<string, any> = {
  nuevo_nombre: string,
  especialidades: array(string),
  usuario_id: string,
  material_id: string,
  asistencia_id: string,
  valor_diario: number,
  jornada: number,
  horas_extra: number,
  valor_hora_extra: number,
  recepcion_estado: {
    type: "string",
    enum: ["observaciones", "conforme"],
  },
  recibido_por: string,
  fotos: array(string),
  categoria_gasto: {
    type: "string",
    enum: ["imprevisto", "mano_obra", "gasto_general"],
  },
  cantidad_recibida: number,
  pagado: { type: "boolean" },
  cliente_rut: string,
  ...strings(
    "nombre,titulo,descripcion,comuna,direccion,fecha_inicio,fecha_termino_estimada,estado,cliente_id,cliente_nombre,cliente_email,cliente_telefono,proyecto_id,proyecto_nombre,telefono,email,rut,rol,trabajador_nombre,actividad_id,metodo,nota,fecha,subtipo,tipo_bitacora,tipo_evento,prioridad,hora_entrada,hora_salida,categoria,correo_remitente,correo_destinatario,correo_asunto,correo_cuerpo,hora,comuna_lugar,resumen,mensaje,observacion,numero_documento,proveedor,proveedor_entidad,fecha_documento",
  ),
  ...numbers(
    "monto,dias,monto_cotizado,cantidad,precio_unitario,porcentaje_avance,monto_documento",
  ),
  unidad: string,
  todos_presentes: { type: "boolean" },
  comprado: { type: "boolean" },
  partidas: array(activity),
  materiales: array(material),
  trabajadores_nombres: array(string),
  roles_destino: array({
    type: "string",
    enum: ["admin", "supervisor", "terreno"],
  }),
  trabajadores: array(
    object(
      {
        ...strings("nombre,rol,telefono,email,rut"),
        especialidades: array(string),
      },
      ["nombre"],
    ),
  ),
};
const actionFields: Record<typeof ACTION_TYPES[number], string> = {
  "crear_proyecto": "nombre monto_cotizado monto comuna direccion descripcion dias fecha_inicio fecha_termino_estimada cliente_id cliente_nombre cliente_email cliente_telefono cliente_rut partidas materiales trabajadores_nombres",
  "crear_proyecto_completo": "nombre monto_cotizado monto comuna direccion descripcion dias fecha_inicio fecha_termino_estimada cliente_id cliente_nombre cliente_email cliente_telefono cliente_rut partidas materiales trabajadores_nombres",
  "actualizar_proyecto": "nuevo_nombre estado monto_cotizado monto fecha_termino_estimada descripcion",
  "eliminar_proyecto": "",
  "crear_cliente": "nombre telefono email rut direccion comuna",
  "actualizar_cliente": "cliente_id nombre nuevo_nombre telefono email rut direccion comuna",
  "actualizar_trabajador": "usuario_id trabajador_nombre nombre nuevo_nombre telefono email rut especialidades",
  "agregar_trabajador": "nombre rol telefono email rut especialidades",
  "agregar_trabajadores": "trabajadores",
  "asignar_trabajador": "trabajador_nombre",
  "asignar_trabajadores": "trabajadores_nombres trabajadores",
  "desasignar_trabajador": "trabajador_nombre",
  "crear_actividad": "nombre dias partidas fecha_inicio",
  "actualizar_avance": "actividad_id nombre porcentaje_avance nota",
  "agregar_material": "nombre unidad cantidad precio_unitario categoria proveedor actividad_id materiales",
  "agregar_materiales": "materiales",
  "actualizar_material": "material_id nombre materiales comprado pagado proveedor precio_unitario cantidad monto",
  "registrar_imprevisto": "descripcion monto categoria_gasto pagado asistencia_id valor_diario jornada horas_extra valor_hora_extra fecha",
  "registrar_pago": "monto metodo nota fecha",
  "crear_bitacora": "titulo nota tipo_bitacora fecha material_id cantidad_recibida fotos",
  "generar_reporte": "titulo resumen",
  "agendar_visita": "titulo fecha hora comuna_lugar tipo_evento descripcion",
  "agendar_evento": "titulo fecha hora comuna_lugar tipo_evento descripcion",
  "generar_mensaje_whatsapp": "mensaje telefono trabajador_nombre trabajadores_nombres roles_destino",
  "enviar_mensaje_equipo": "mensaje roles_destino trabajadores_nombres",
  "crear_solicitud_cambio": "subtipo titulo descripcion monto dias prioridad materiales fecha",
  "registrar_asistencia": "trabajador_nombre todos_presentes fecha estado hora_entrada hora_salida observacion",
  "registrar_documento": "nombre categoria descripcion correo_remitente correo_destinatario correo_asunto correo_cuerpo fecha numero_documento proveedor proveedor_entidad monto_documento fecha_documento recepcion_estado recibido_por fotos"
};
export const ACTION_SCHEMAS = ACTION_TYPES.map(tipo => {
  const fields = ['proyecto_id', 'proyecto_nombre', ...actionFields[tipo].split(' ').filter(Boolean)];
  const properties = Object.fromEntries(fields.map(field => [field, actionProperties[field]]));
  return object({ tipo: { type: 'string', enum: [tipo] }, ...properties },
    ['crear_proyecto', 'crear_proyecto_completo'].includes(tipo) ? ['tipo', 'nombre', 'monto_cotizado'] : ['tipo']);
});

// Contratos por tipo de acción, compatibles con Structured Outputs estricto.
// La validación del servidor y la prevalidación del lote siguen siendo obligatorias.
export const CHAT_RESPONSE_SCHEMA = object(
  {
    respuesta: string,
    respuesta_consulta: string,
    acciones: array({ anyOf: ACTION_SCHEMAS }),
    sugerencias: array(string),
    registro_propuesto: {
      ...object(
        {
          tipo: { type: "string", enum: ["trabajador", "cliente"] },
          ...strings(
            "nombre,rut,telefono,email,rol,proyecto_id,proyecto_nombre,direccion,comuna",
          ),
          especialidades: array(string),
        },
        ["tipo"],
      ),
      type: ["object", "null"],
    },
    busqueda_materiales: {
      ...object(
        {
          ...strings(
            "producto,marca,modelo,presentacion,ubicacion,unidad_cantidad",
          ),
          cantidad: number,
          tiendas: array(string),
        },
        ["producto"],
      ),
      type: ["object", "null"],
    },
    obra_propuesta: {
      ...object({
        ...strings(
          "nombre,cliente_nombre,cliente_id,cliente_email,cliente_telefono,comuna,direccion,descripcion,fecha_inicio",
        ),
        ...numbers("monto_cotizado,dias"),
        cliente_rut: string,
        partidas: array(activity),
      }),
      type: ["object", "null"],
    },
    cotizacion: {
      ...object(
        {
          ...strings(
            "titulo_proyecto,tipo_obra,comuna_region,resumen_ejecutivo,cliente_id,cliente_nombre,cliente_telefono,cliente_email,cliente_contacto,fecha_validez,observaciones,condiciones_pago",
          ),
          ...numbers("metros_cuadrados,duracion_dias_estimada"),
          modo_presupuesto: {
            type: "string",
            enum: ["estimado", "precio_acordado"],
          },
          tratamiento_iva: { type: "string", enum: ["neto", "incluido"] },
          nombre_alternativa: string,
          mostrar_fecha: { type: "boolean" },
          nombre_archivo: string,
          partidas_venta: array(
            object(
              {
                nombre: string,
                unidad: string,
                cantidad: number,
                precio_unitario: number,
              },
              ["nombre", "unidad", "cantidad", "precio_unitario"],
            ),
          ),
          hitos_pago: array(
            object({ nombre: string, porcentaje: number }, [
              "nombre",
              "porcentaje",
            ]),
          ),
          materiales: array(
            object(
              {
                ...strings("nombre,categoria,unidad"),
                ...numbers("cantidad,precio_unitario_estimado"),
                precio_incluye_iva: { type: "boolean" },
              },
              ["nombre", "cantidad", "precio_unitario_estimado"],
            ),
          ),
          mano_de_obra: array(
            object(
              {
                rol: string,
                ...numbers(
                  "cantidad_personas,dias_estimados,valor_jornal_diario",
                ),
              },
              [
                "rol",
                "cantidad_personas",
                "dias_estimados",
                "valor_jornal_diario",
              ],
            ),
          ),
          estructura_financiera: object({
            ...numbers(
              "gastos_generales_porcentaje,imprevistos_porcentaje,margen_utilidad_porcentaje",
            ),
            tipo_utilidad: {
              type: "string",
              enum: ["recargo_costos", "margen_venta"],
            },
          }),
          actividades_gantt: { ...array(activity), minItems: 1 },
        },
        [
          "titulo_proyecto",
          "materiales",
          "mano_de_obra",
          "duracion_dias_estimada",
          "resumen_ejecutivo",
          "estructura_financiera",
          "actividades_gantt",
        ],
      ),
      type: ["object", "null"],
    },
  },
  ["respuesta", "acciones", "cotizacion"],
);

// Las alternativas usan el contrato exclusivo de cotización.
// El servidor valida el máximo de cuatro propuestas.
export const QUOTE_RESPONSE_SCHEMA = object(
  {
    respuesta: string,
    cotizaciones: {
      type: "array",
      items: {
        ...(CHAT_RESPONSE_SCHEMA.properties.cotizacion as Record<
          string,
          unknown
        >),
        type: "object",
      },
    },
    sugerencias: array(string),
  },
  ["respuesta", "cotizaciones"],
);

// En WhatsApp la creación pasa exclusivamente por el borrador y su validación de cinco campos.
// El modelo no puede saltarse ese flujo emitiendo una creación directa incompleta.
export const WHATSAPP_RESPONSE_SCHEMA = JSON.parse(
  JSON.stringify(CHAT_RESPONSE_SCHEMA),
);
WHATSAPP_RESPONSE_SCHEMA.required.push("obra_propuesta");
WHATSAPP_RESPONSE_SCHEMA.properties.acciones.items.anyOf =
  WHATSAPP_RESPONSE_SCHEMA.properties.acciones.items.anyOf.filter(
    (schema: any) => !['crear_proyecto', 'crear_proyecto_completo'].includes(schema.properties.tipo.enum[0]),
  );

export const MATERIAL_QUERY_SCHEMA = object(
  {
    respuesta: string,
    busqueda_materiales: materialQuery,
  },
  ["respuesta", "busqueda_materiales"],
);
