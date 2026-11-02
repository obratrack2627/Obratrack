import { dataService, DataService } from './data-service';
import { getCoordenadasComuna, REGIONES_CHILE } from './chile-locations';
import type {
  Cliente,
  CotizacionEstimacion,
  MaterialProyecto,
  Proyecto,
} from '@/types/database';

export interface ConversionPresupuestoResultado {
  proyecto: Proyecto;
  cliente: Cliente | null;
  actividadesCreadas: number;
  materialesCargados: number;
}

function resolverComunaYRegion(comunaRegionRaw?: string): {
  comuna: string;
  region: string;
  latitud?: number;
  longitud?: number;
} {
  const raw = (comunaRegionRaw || 'Por definir').trim();
  const primeraParte = raw.split(',')[0]?.trim() || 'Por definir';

  let comunaDetectada = primeraParte;
  let regionDetectada = '';
  let reconocida = false;

  const locationKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^comuna(?: de)?\s+/, '').trim();
  for (const reg of REGIONES_CHILE) {
    const comunaMatch = reg.comunas.find(
      (c) =>
        locationKey(c) === locationKey(primeraParte)
    );
    if (comunaMatch) {
      reconocida = true;
      comunaDetectada = comunaMatch;
      regionDetectada = reg.nombre;
      break;
    }
  }

  const coords = reconocida ? getCoordenadasComuna(comunaDetectada) : undefined;
  return {
    comuna: comunaDetectada,
    region: regionDetectada,
    latitud: coords?.lat,
    longitud: coords?.lng,
  };
}

/**
 * Convierte una cotización/presupuesto en una Obra activa completa en 1 clic:
 * - Reutiliza o crea el Cliente asociado.
 * - Crea el Proyecto con monto cotizado (IVA incluido), plazos y coordenadas GPS en Chile.
 * - Precarga las partidas sugeridas en la Carta Gantt.
 * - Precarga la cubicación de materiales en Finanzas de la obra.
 * - Registra el hito inicial de trazabilidad en la Bitácora.
 */
export function convertirPresupuestoEnObra(
  cotizacion: CotizacionEstimacion,
  options?: {
    service?: DataService;
    fechaInicio?: string;
    incluirGantt?: boolean;
    incluirMateriales?: boolean;
  }
): ConversionPresupuestoResultado {
  const service = options?.service || dataService;

  if (!cotizacion || !cotizacion.titulo_proyecto?.trim()) {
    throw new Error('El presupuesto no contiene un título de proyecto válido.');
  }

  const activeUser = service.getActiveUser();
  if (!activeUser?.empresa_id || !['admin', 'supervisor'].includes(activeUser.rol)) throw new Error('Inicia sesión con administración o supervisión para convertir un presupuesto.');
  const empresaId = activeUser.empresa_id;

  // 1. Resolver o crear cliente
  let cliente: Cliente | null = null;
  if (cotizacion.cliente_id) {
    cliente = service.getClienteById(cotizacion.cliente_id);
  }
  if (!cliente && cotizacion.cliente_nombre?.trim()) {
    cliente = service.buscarClientePorRutONombre(cotizacion.cliente_nombre.trim());
    if (!cliente) {
      cliente = service.createCliente({
        empresa_id: empresaId,
        nombre: cotizacion.cliente_nombre.trim(),
        telefono: cotizacion.cliente_telefono || '',
        email: cotizacion.cliente_email || '',
        direccion: cotizacion.comuna_region || '',
      });
    }
  }

  // 2. Ubicación geográfica
  const ubicacion = resolverComunaYRegion(cotizacion.comuna_region);

  // 3. Partidas iniciales de Carta Gantt y plazos
  const partidasOrdenadas = [...(cotizacion.actividades_gantt || [])]
    .filter((a) => a && a.nombre?.trim())
    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
    .map((a) => ({
      nombre: a.nombre.trim(),
      dias: Math.max(1, Math.round(Number(a.dias) || 5)),
    }));

  const actividadesIniciales =
    partidasOrdenadas.length > 0
      ? partidasOrdenadas
      : [{ nombre: 'Ejecutar alcance presupuestado', dias: Math.max(1, Math.round(Number(cotizacion.duracion_dias_estimada) || 1)) }];

  const sumaDiasPartidas = actividadesIniciales.reduce((acc, a) => acc + a.dias, 0);
  const duracionTotal = Math.max(
    sumaDiasPartidas,
    Math.round(Number(cotizacion.duracion_dias_estimada) || 0),
    1
  );

  const fechaInicio = options?.fechaInicio || new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
  const terminoDate = new Date(`${fechaInicio}T12:00:00`);
  terminoDate.setDate(terminoDate.getDate() + duracionTotal);
  const fechaTermino = terminoDate.toISOString().split('T')[0];

  const montoTotalConIva = Math.max(
    0,
    Math.round(Number(cotizacion.estructura_financiera?.precio_total_con_iva) || 0)
  );

  // 4. Crear Proyecto + Carta Gantt (valida también límite del Plan Gratis)
  const proyecto = service.createProyecto(
    {
      empresa_id: empresaId,
      cliente_id: cliente?.id,
      nombre: cotizacion.titulo_proyecto.trim(),
      descripcion:
        cotizacion.resumen_ejecutivo?.trim() ||
        `Obra generada a partir de presupuesto ${cotizacion.id}.`,
      direccion: cotizacion.comuna_region || ubicacion.comuna,
      comuna: ubicacion.comuna,
      region: ubicacion.region,
      latitud: ubicacion.latitud,
      longitud: ubicacion.longitud,
      fecha_inicio: fechaInicio,
      fecha_termino_estimada: fechaTermino,
      estado: 'activo',
      monto_cotizado: montoTotalConIva,
      trabajadores_ids: [],
    },
    options?.incluirGantt === false ? [] : actividadesIniciales
  );

  // 5. Precargar Materiales cubicados
  const materialesCreados: MaterialProyecto[] = [];
  for (const mat of options?.incluirMateriales === false ? [] : cotizacion.materiales || []) {
    if (!mat?.nombre?.trim()) continue;
    const cantidad = Number(mat.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('Revisa la cantidad de los materiales del presupuesto.');
    const precioUnit = Math.max(
      0,
      Math.round(Number(mat.precio_mas_barato ?? mat.precio_unitario_estimado) || 0)
    );
    const subtotal = Math.max(0, Math.round(cantidad * precioUnit));

    const creado = service.createMaterialProyecto({
      proyecto_id: proyecto.id,
      nombre: mat.nombre.trim(),
      categoria: mat.categoria || 'Cubicación Presupuesto',
      cantidad,
      unidad: mat.unidad || 'un',
      precio_unitario: precioUnit,
      subtotal,
      proveedor: mat.mejor_tienda || 'Por confirmar',
      comprado: false,
    });
    materialesCreados.push(creado);
  }

  // 6. Trazabilidad inicial en Bitácora
  service.createBitacoraEntrada({
    proyecto_id: proyecto.id,
    usuario_id: activeUser?.id || 'u-sistema',
    autor_nombre: activeUser?.nombre || 'Administración ObraTrack',
    titulo: 'Inicio de Obra desde Presupuesto Aprobado',
    nota: `Obra creada desde presupuesto "${cotizacion.titulo_proyecto}" por $${montoTotalConIva.toLocaleString('es-CL')} CLP (IVA incl.), con ${options?.incluirGantt === false ? 0 : actividadesIniciales.length} partidas en Carta Gantt y ${materialesCreados.length} materiales cubicados.`,
    fecha: fechaInicio,
    tipo: 'avance',
  });

  const proyectoHidratado = service.getProyectoById(proyecto.id) || proyecto;

  return {
    proyecto: proyectoHidratado,
    cliente,
    actividadesCreadas: options?.incluirGantt === false ? 0 : actividadesIniciales.length,
    materialesCargados: materialesCreados.length,
  };
}
