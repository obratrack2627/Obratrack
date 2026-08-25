import {
  Proyecto,
  Actividad,
  Pago,
  Imprevisto,
  ReporteWhatsApp,
  Usuario,
  Cliente,
  UserRole,
  CotizacionEstimacion,
  SubscriptionPlanId,
} from '@/types/database';
import {
  INITIAL_PROYECTOS,
  INITIAL_ACTIVIDADES,
  INITIAL_PAGOS,
  INITIAL_IMPREVISTOS,
  INITIAL_REPORTES,
  INITIAL_USUARIOS,
  INITIAL_CLIENTES,
  INITIAL_COTIZACIONES,
  CATALOGO_MATERIALES_CHILE,
} from './mock-data';

// Claves de almacenamiento local para persistencia en modo prototipo/demostración
const KEYS = {
  PROYECTOS: 'obratrack_proyectos_v1',
  ACTIVIDADES: 'obratrack_actividades_v1',
  PAGOS: 'obratrack_pagos_v1',
  IMPREVISTOS: 'obratrack_imprevistos_v1',
  REPORTES: 'obratrack_reportes_v1',
  USUARIOS: 'obratrack_usuarios_v1',
  CLIENTES: 'obratrack_clientes_v1',
  ACTIVE_USER: 'obratrack_active_user_v1',
  COTIZACIONES: 'obratrack_cotizaciones_v1',
  PLAN: 'obratrack_active_plan_v1',
};

class DataService {
  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private getItem<T>(key: string, defaultValue: T): T {
    if (!this.isBrowser()) return defaultValue;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setItem<T>(key: string, value: T): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Error saving to localStorage', e);
    }
  }

  // --- USUARIOS Y ROL ACTIVO ---
  getUsuarios(): Usuario[] {
    return this.getItem<Usuario[]>(KEYS.USUARIOS, INITIAL_USUARIOS);
  }

  createUsuario(usuario: Omit<Usuario, 'id'>): Usuario {
    const usuarios = this.getUsuarios();
    const newUsuario: Usuario = {
      ...usuario,
      id: 'u-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    usuarios.push(newUsuario);
    this.setItem(KEYS.USUARIOS, usuarios);
    return newUsuario;
  }

  getActiveUser(): Usuario {
    const usuarios = this.getUsuarios();
    const defaultUser = usuarios.find((u) => u.rol === 'admin') || usuarios[0];
    return this.getItem<Usuario>(KEYS.ACTIVE_USER, defaultUser);
  }

  setActiveUserRole(rol: UserRole): Usuario {
    const usuarios = this.getUsuarios();
    const user = usuarios.find((u) => u.rol === rol) || usuarios[0];
    this.setItem(KEYS.ACTIVE_USER, user);
    return user;
  }

  // --- PLANES DE SUSCRIPCIÓN (MODO DEMO / PROFESORES) ---
  getActivePlan(): SubscriptionPlanId {
    return this.getItem<SubscriptionPlanId>(KEYS.PLAN, 'pro_ia');
  }

  setActivePlan(plan: SubscriptionPlanId): SubscriptionPlanId {
    this.setItem(KEYS.PLAN, plan);
    if (this.isBrowser()) {
      window.dispatchEvent(new CustomEvent('obratrack_plan_changed', { detail: plan }));
    }
    return plan;
  }

  // --- CLIENTES ---
  getClientes(): Cliente[] {
    return this.getItem<Cliente[]>(KEYS.CLIENTES, INITIAL_CLIENTES);
  }

  createCliente(cliente: Omit<Cliente, 'id'>): Cliente {
    const clientes = this.getClientes();
    const newCliente: Cliente = {
      ...cliente,
      id: 'c-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    clientes.push(newCliente);
    this.setItem(KEYS.CLIENTES, clientes);
    return newCliente;
  }

  // --- PROYECTOS ---
  getProyectos(): Proyecto[] {
    const proyectos = this.getItem<Proyecto[]>(KEYS.PROYECTOS, INITIAL_PROYECTOS);
    const clientes = this.getClientes();
    const actividades = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const pagos = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    const imprevistos = this.getItem<Imprevisto[]>(KEYS.IMPREVISTOS, INITIAL_IMPREVISTOS);

    return proyectos.map((p) => {
      const projActs = actividades.filter((a) => a.proyecto_id === p.id);
      const projPagos = pagos.filter((pay) => pay.proyecto_id === p.id);
      const projImprevistos = imprevistos.filter((imp) => imp.proyecto_id === p.id);

      const total_pagado = projPagos.reduce((sum, item) => sum + Number(item.monto), 0);
      const total_imprevistos = projImprevistos.reduce((sum, item) => sum + Number(item.monto), 0);
      const saldo_pendiente = Math.max(0, p.monto_cotizado - total_pagado);

      // Avance ponderado: promedio del porcentaje de sus actividades
      let porcentaje_avance_ponderado = 0;
      if (projActs.length > 0) {
        const sumAvance = projActs.reduce((acc, curr) => acc + Number(curr.porcentaje_avance), 0);
        porcentaje_avance_ponderado = Math.round(sumAvance / projActs.length);
      }

      return {
        ...p,
        cliente: clientes.find((c) => c.id === p.cliente_id),
        actividades: projActs,
        pagos: projPagos,
        imprevistos: projImprevistos,
        total_pagado,
        total_imprevistos,
        saldo_pendiente,
        porcentaje_avance_ponderado,
      };
    });
  }

  getProyectoById(id: string): Proyecto | null {
    const proyectos = this.getProyectos();
    return proyectos.find((p) => p.id === id) || null;
  }

  createProyecto(
    data: Omit<Proyecto, 'id'>,
    actividadesIniciales?: Array<{ nombre: string; dias: number }>
  ): Proyecto {
    const proyectos = this.getItem<Proyecto[]>(KEYS.PROYECTOS, INITIAL_PROYECTOS);
    const newProjId = 'p-' + Date.now();
    const newProyecto: Proyecto = {
      ...data,
      id: newProjId,
      created_at: new Date().toISOString(),
    };
    proyectos.unshift(newProyecto);
    this.setItem(KEYS.PROYECTOS, proyectos);

    // Crear actividades iniciales si se pasaron
    if (actividadesIniciales && actividadesIniciales.length > 0) {
      const allActs = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
      let currentStartDate = new Date(data.fecha_inicio);

      actividadesIniciales.forEach((act, idx) => {
        const endDate = new Date(currentStartDate);
        endDate.setDate(endDate.getDate() + (act.dias || 7));

        allActs.push({
          id: `act-${newProjId}-${idx + 1}`,
          proyecto_id: newProjId,
          nombre: act.nombre,
          fecha_inicio: currentStartDate.toISOString().split('T')[0],
          fecha_termino: endDate.toISOString().split('T')[0],
          porcentaje_avance: 0,
          estado: 'pendiente',
          orden: idx + 1,
        });

        currentStartDate = new Date(endDate);
        currentStartDate.setDate(currentStartDate.getDate() + 1);
      });

      this.setItem(KEYS.ACTIVIDADES, allActs);
    }

    return newProyecto;
  }

  deleteProyecto(id: string): boolean {
    const proyectos = this.getItem<Proyecto[]>(KEYS.PROYECTOS, INITIAL_PROYECTOS);
    const filtered = proyectos.filter((p) => p.id !== id);
    this.setItem(KEYS.PROYECTOS, filtered);

    // Limpiar actividades, pagos e imprevistos asociados al proyecto
    const actividades = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    this.setItem(
      KEYS.ACTIVIDADES,
      actividades.filter((a) => a.proyecto_id !== id)
    );

    const pagos = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    this.setItem(
      KEYS.PAGOS,
      pagos.filter((pay) => pay.proyecto_id !== id)
    );

    const imprevistos = this.getItem<Imprevisto[]>(KEYS.IMPREVISTOS, INITIAL_IMPREVISTOS);
    this.setItem(
      KEYS.IMPREVISTOS,
      imprevistos.filter((imp) => imp.proyecto_id !== id)
    );

    return true;
  }

  // --- ACTIVIDADES (CARTA GANTT) ---
  getActividades(proyectoId: string): Actividad[] {
    const all = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const usuarios = this.getUsuarios();
    return all
      .filter((a) => a.proyecto_id === proyectoId)
      .map((a) => ({
        ...a,
        responsable: usuarios.find((u) => u.id === a.responsable_id),
      }))
      .sort((a, b) => a.orden - b.orden);
  }

  createActividad(actividad: Omit<Actividad, 'id'>): Actividad {
    const all = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const newAct: Actividad = {
      ...actividad,
      id: 'act-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    all.push(newAct);
    this.setItem(KEYS.ACTIVIDADES, all);
    return newAct;
  }

  updateActividad(id: string, updates: Partial<Actividad>): Actividad | null {
    const all = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const index = all.findIndex((a) => a.id === id);
    if (index === -1) return null;

    const updated = { ...all[index], ...updates, updated_at: new Date().toISOString() };
    all[index] = updated;
    this.setItem(KEYS.ACTIVIDADES, all);
    return updated;
  }

  // --- PAGOS & FINANZAS ---
  getPagos(proyectoId: string): Pago[] {
    const all = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    return all.filter((p) => p.proyecto_id === proyectoId);
  }

  createPago(pago: Omit<Pago, 'id'>): Pago {
    const all = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    const newPago: Pago = {
      ...pago,
      id: 'pay-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    all.unshift(newPago);
    this.setItem(KEYS.PAGOS, all);
    return newPago;
  }

  // --- IMPREVISTOS ---
  getImprevistos(proyectoId: string): Imprevisto[] {
    const all = this.getItem<Imprevisto[]>(KEYS.IMPREVISTOS, INITIAL_IMPREVISTOS);
    const acts = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    return all
      .filter((i) => i.proyecto_id === proyectoId)
      .map((i) => ({
        ...i,
        actividad: acts.find((a) => a.id === i.actividad_id),
      }));
  }

  createImprevisto(imprevisto: Omit<Imprevisto, 'id'>): Imprevisto {
    const all = this.getItem<Imprevisto[]>(KEYS.IMPREVISTOS, INITIAL_IMPREVISTOS);
    const newImp: Imprevisto = {
      ...imprevisto,
      id: 'imp-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    all.unshift(newImp);
    this.setItem(KEYS.IMPREVISTOS, all);
    return newImp;
  }

  // --- BANDEJA DE REPORTES WHATSAPP ---
  getReportes(): ReporteWhatsApp[] {
    const all = this.getItem<ReporteWhatsApp[]>(KEYS.REPORTES, INITIAL_REPORTES);
    const proyectos = this.getProyectos();
    const usuarios = this.getUsuarios();

    return all.map((r) => ({
      ...r,
      proyecto: proyectos.find((p) => p.id === r.proyecto_id),
      usuario: usuarios.find((u) => u.id === r.usuario_id),
    }));
  }

  createReporte(reporte: Omit<ReporteWhatsApp, 'id'>): ReporteWhatsApp {
    const all = this.getItem<ReporteWhatsApp[]>(KEYS.REPORTES, INITIAL_REPORTES);
    const newRep: ReporteWhatsApp = {
      ...reporte,
      id: 'rep-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    all.unshift(newRep);
    this.setItem(KEYS.REPORTES, all);
    return newRep;
  }

  aprobarReporte(reporteId: string, customData?: { avance_porcentaje?: number; imprevisto_monto?: number; imprevisto_descripcion?: string }): boolean {
    const reportes = this.getItem<ReporteWhatsApp[]>(KEYS.REPORTES, INITIAL_REPORTES);
    const reporte = reportes.find((r) => r.id === reporteId);
    if (!reporte) return false;

    // Marcar reporte como aprobado
    reporte.estado = 'aprobado';
    this.setItem(KEYS.REPORTES, reportes);

    const extraccion = reporte.extraccion_ia;
    const finalAvance = customData?.avance_porcentaje !== undefined ? customData.avance_porcentaje : extraccion.avance_porcentaje;
    const finalImpMonto = customData?.imprevisto_monto !== undefined ? customData.imprevisto_monto : extraccion.imprevisto_monto_estimado;
    const finalImpDesc = customData?.imprevisto_descripcion !== undefined ? customData.imprevisto_descripcion : extraccion.imprevisto_descripcion;

    // 1. Si detectó actividad, actualizar su porcentaje de avance en la Gantt
    if (reporte.proyecto_id && (extraccion.actividad_detectada || finalAvance !== undefined)) {
      const actividades = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
      const act = actividades.find(
        (a) =>
          a.proyecto_id === reporte.proyecto_id &&
          (a.nombre.toLowerCase().includes((extraccion.actividad_detectada || '').toLowerCase()) ||
            (extraccion.actividad_detectada || '').toLowerCase().includes(a.nombre.toLowerCase()))
      );

      if (act && finalAvance !== undefined && finalAvance !== null) {
        act.porcentaje_avance = finalAvance;
        act.estado = finalAvance === 100 ? 'terminada' : (finalAvance > 0 ? 'en_curso' : 'pendiente');
        this.setItem(KEYS.ACTIVIDADES, actividades);
      }
    }

    // 2. Si tiene imprevisto, agregarlo a la tabla de imprevistos del proyecto
    if (reporte.proyecto_id && (extraccion.tiene_imprevisto || (finalImpMonto && finalImpMonto > 0))) {
      this.createImprevisto({
        proyecto_id: reporte.proyecto_id,
        descripcion: finalImpDesc || 'Imprevisto reportado por WhatsApp',
        monto: Number(finalImpMonto) || 0,
        fecha: new Date().toISOString().split('T')[0],
        origen: 'whatsapp_ia',
      });
    }

    return true;
  }

  rechazarReporte(reporteId: string): boolean {
    const reportes = this.getItem<ReporteWhatsApp[]>(KEYS.REPORTES, INITIAL_REPORTES);
    const reporte = reportes.find((r) => r.id === reporteId);
    if (!reporte) return false;

    reporte.estado = 'rechazado';
    this.setItem(KEYS.REPORTES, reportes);
    return true;
  }

  // --- COTIZADOR INTELIGENTE & RADAR DE PRECIOS DE MATERIALES (IA) ---
  getCotizaciones(): CotizacionEstimacion[] {
    return this.getItem<CotizacionEstimacion[]>(KEYS.COTIZACIONES, INITIAL_COTIZACIONES);
  }

  getCotizacionById(id: string): CotizacionEstimacion | null {
    const list = this.getCotizaciones();
    return list.find((c) => c.id === id) || null;
  }

  saveCotizacion(cotizacion: CotizacionEstimacion): CotizacionEstimacion {
    const list = this.getCotizaciones();
    const index = list.findIndex((c) => c.id === cotizacion.id);
    if (index >= 0) {
      list[index] = cotizacion;
    } else {
      list.unshift(cotizacion);
    }
    this.setItem(KEYS.COTIZACIONES, list);
    return cotizacion;
  }

  deleteCotizacion(id: string): boolean {
    let list = this.getCotizaciones();
    list = list.filter((c) => c.id !== id);
    this.setItem(KEYS.COTIZACIONES, list);
    return true;
  }

  getCatalogoMateriales() {
    return CATALOGO_MATERIALES_CHILE;
  }

  crearProyectoDesdeCotizacion(
    cotizacion: CotizacionEstimacion,
    clienteId?: string,
    fechaInicio?: string
  ): Proyecto {
    const defaultDate = fechaInicio || new Date().toISOString().split('T')[0];
    const clientes = this.getClientes();
    const targetClienteId = clienteId || (clientes[0]?.id ?? 'c1');

    // Calcular fecha de término estimada sumando los días hábiles/estimados
    const startDate = new Date(defaultDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (cotizacion.duracion_dias_estimada || 20));

    const actividadesIniciales = cotizacion.actividades_gantt && cotizacion.actividades_gantt.length > 0
      ? cotizacion.actividades_gantt.map((act) => ({
          nombre: act.nombre,
          dias: act.dias || 4,
        }))
      : [
          { nombre: 'Instalación de faenas y trazado', dias: 3 },
          { nombre: 'Ejecución de obra gruesa', dias: 7 },
          { nombre: 'Instalaciones y techumbre', dias: 5 },
          { nombre: 'Terminaciones y entrega', dias: 4 },
        ];

    const nuevoProyecto = this.createProyecto(
      {
        empresa_id: 'e1111111-1111-1111-1111-111111111111',
        cliente_id: targetClienteId,
        nombre: cotizacion.titulo_proyecto,
        descripcion: `${cotizacion.resumen_ejecutivo}\n(Creado automáticamente desde Cotizador IA ObraTrack)`,
        fecha_inicio: defaultDate,
        fecha_termino_estimada: endDate.toISOString().split('T')[0],
        estado: 'activo',
        monto_cotizado: cotizacion.estructura_financiera.precio_sugerido_neto,
      },
      actividadesIniciales
    );

    return nuevoProyecto;
  }
}

export const dataService = new DataService();

