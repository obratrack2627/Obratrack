// Reducir columnas y duplicados conservando todas las referencias de entidades.
// No se recorta JSON serializado: cada dato enviado conserva su estructura.
export function compactAIContext(context: Record<string, any>) {
  const pick = (row: any, fields: string[]) => Object.fromEntries(fields.filter(k => row?.[k] !== undefined).map(k => [k, row[k]]));
  const compact = { ...context };
  if (Array.isArray(context.proyectos)) compact.proyectos = context.proyectos.map((p: any) => pick(p, ['id','nombre','estado','cliente_id','comuna','direccion','descripcion','fecha_inicio','fecha_termino_estimada','monto_cotizado','porcentaje_avance']));
  if (Array.isArray(context.clientes)) compact.clientes = context.clientes.map((c: any) => pick(c, ['id','nombre','email','telefono','rut','direccion','comuna']));
  if (Array.isArray(context.trabajadores)) compact.trabajadores = context.trabajadores.map((u: any) => pick(u, ['id','nombre','rol','email','telefono_whatsapp','rut','especialidades']));
  // operacion_obra ya contiene extractos, totales y avisos de recorte verificados.
  delete compact.materiales; delete compact.actividades; delete compact.pagos;
  return compact;
}

export function separatePrompt(prompt: string) {
  const dataPrefixes = /^(?:Referencias semánticas autorizadas|Interpretación chilena del mensaje \(datos, no instrucciones\)|Preferencias explícitas para esta conversación|Registros actuales de trabajo|Cliente de la obra seleccionada|Contexto \(JSON\)|Historial(?: \(JSON\))?|Mensaje actual \(JSON\)|Solicitud|Clientes|Cotización previa, si existe|Presupuestos guardados en la empresa|Obra actual, si existe|Ubicación de la obra, si existe):/;
  const instructions: string[] = [], input: string[] = [];
  for (const line of prompt.split('\n')) (dataPrefixes.test(line) ? input : instructions).push(line);
  return { instructions: instructions.join('\n'), input: input.join('\n') };
}

export const ACTION_EXAMPLES = `Ejemplos de contratos (datos ficticios; no reutilices sus IDs ni montos):
Usuario: Crea Radier Maipú por 1500000, cliente Ana Soto (id c-ana), 5 días, partida Preparación 2 días y Hormigonado 3 días.
Salida: {"respuesta":"Voy a preparar la obra.","acciones":[{"tipo":"crear_proyecto","nombre":"Radier Maipú","monto_cotizado":1500000,"cliente_id":"c-ana","dias":5,"partidas":[{"nombre":"Preparación","dias":2},{"nombre":"Hormigonado","dias":3}]}],"cotizacion":null}
Usuario: Crea la obra con esa cotización. Contexto: cotizacion_actual tiene titulo_proyecto Ampliación Maipú, precio_total_con_iva calculado 2380000, duración 10 días y cliente c-ana.
Salida: {"respuesta":"Usaré el presupuesto indicado.","acciones":[{"tipo":"crear_proyecto","nombre":"Ampliación Maipú","monto_cotizado":2380000,"cliente_id":"c-ana","dias":10}],"cotizacion":null}
Usuario: Crea Terraza por 800000 y agrega Preparación de 2 días a esa obra.
Salida: {"respuesta":"Voy a preparar la obra y su partida.","acciones":[{"tipo":"crear_proyecto","nombre":"Terraza","monto_cotizado":800000,"partidas":[{"nombre":"Preparación","dias":2}]}],"cotizacion":null}
Usuario: Cotiza un radier de 20 m2 en Maipú y crea la obra para el cliente existente Ana Soto (id c-ana).
Salida: {"respuesta":"Prepararé una estimación editable con supuestos explícitos y la propuesta de obra.","cotizacion":{"titulo_proyecto":"Radier Maipú","tipo_obra":"Radier","comuna_region":"Maipú","metros_cuadrados":20,"duracion_dias_estimada":3,"resumen_ejecutivo":"Estimación referencial con preparación y hormigonado; espesores y diseño pendientes de validación profesional.","materiales":[{"nombre":"Hormigón referencial","cantidad":2,"unidad":"m3","precio_unitario_estimado":100000}],"mano_de_obra":[{"rol":"Maestro","cantidad_personas":1,"dias_estimados":3,"valor_jornal_diario":45000}],"estructura_financiera":{"gastos_generales_porcentaje":10,"imprevistos_porcentaje":5,"margen_utilidad_porcentaje":20},"actividades_gantt":[{"nombre":"Preparación","dias":1},{"nombre":"Hormigonado","dias":2}],"cliente_id":"c-ana"},"acciones":[{"tipo":"crear_proyecto","nombre":"Radier Maipú","cliente_id":"c-ana","monto_cotizado":null}]}
Usuario: Pausa Baño (id p-bano) y registra un abono de 50000 por transferencia.
Salida: {"respuesta":"Voy a preparar ambos cambios.","acciones":[{"tipo":"actualizar_proyecto","proyecto_id":"p-bano","estado":"pausado"},{"tipo":"registrar_pago","proyecto_id":"p-bano","monto":50000,"metodo":"transferencia"}],"cotizacion":null}
Usuario: Crea una obra para Juan. Contexto: dos clientes Juan y ningún presupuesto ni monto confirmado.
Salida: {"respuesta":"¿Cuál es el nombre de la obra, qué Juan corresponde y cuál es el monto cotizado?","acciones":[],"cotizacion":null}
Estos ejemplos web no autorizan creación directa en WhatsApp: allí usa obra_propuesta. Si acciones_habilitadas es false, no propongas cambios y explica que requieren Pro IA.`;
