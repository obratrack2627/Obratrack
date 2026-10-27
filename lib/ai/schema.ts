import { ACTION_TYPES } from './protocol';

const string = { type: 'string' };
const number = { type: 'number' };
const strings = (names: string) => Object.fromEntries(names.split(',').map(name => [name, string]));
const numbers = (names: string) => Object.fromEntries(names.split(',').map(name => [name, number]));
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items: Record<string, unknown>) => ({ type: 'array', items });
const activity = object({ nombre: string, dias: number }, ['nombre', 'dias']);
const material = object({ ...strings('nombre,unidad,categoria,proveedor'), ...numbers('cantidad,precio_unitario') }, ['nombre', 'cantidad', 'precio_unitario']);

// Enum y campos explícitos evitan que Gemini invente operaciones o descarte sus parámetros.
// La validación del servidor y la prevalidación del lote siguen siendo obligatorias.
export const CHAT_RESPONSE_SCHEMA = object({
  respuesta: string,
  acciones: array(object({
    tipo: { type: 'string', enum: [...ACTION_TYPES] },
    ...strings('nombre,titulo,descripcion,comuna,direccion,fecha_inicio,fecha_termino_estimada,estado,cliente_id,cliente_nombre,proyecto_id,proyecto_nombre,telefono,email,rut,rol,trabajador_nombre,actividad_id,metodo,nota,fecha,subtipo,tipo_bitacora,tipo_evento,prioridad,hora_entrada,hora_salida,categoria,correo_remitente,correo_destinatario,correo_asunto,correo_cuerpo,hora,comuna_lugar,resumen,mensaje,observacion,numero_documento,proveedor_entidad,fecha_documento'),
    ...numbers('monto,dias,monto_cotizado,cantidad,precio_unitario,porcentaje_avance,monto_documento'),
    unidad: string,
    todos_presentes: { type: 'boolean' },
    partidas: array(activity),
    materiales: array(material),
    trabajadores_nombres: array(string),
    trabajadores: array(object(strings('nombre,rol,telefono,email,rut'), ['nombre'])),
  }, ['tipo'])),
  sugerencias: array(string),
  cotizacion: {
    ...object({
      ...strings('titulo_proyecto,tipo_obra,comuna_region,resumen_ejecutivo,cliente_id,cliente_nombre,cliente_telefono,condiciones_pago'),
      ...numbers('metros_cuadrados,duracion_dias_estimada'),
      materiales: array(object({ ...strings('nombre,categoria,unidad'), ...numbers('cantidad,precio_unitario_estimado') }, ['nombre', 'cantidad', 'precio_unitario_estimado'])),
      mano_de_obra: array(object({ rol: string, ...numbers('cantidad_personas,dias_estimados,valor_jornal_diario') }, ['rol', 'cantidad_personas', 'dias_estimados', 'valor_jornal_diario'])),
      estructura_financiera: object(numbers('gastos_generales_porcentaje,imprevistos_porcentaje,margen_utilidad_porcentaje')),
      actividades_gantt: array(activity),
    }, ['titulo_proyecto', 'materiales', 'mano_de_obra']),
    type: ['object', 'null'],
  },
}, ['respuesta', 'acciones', 'cotizacion']);
