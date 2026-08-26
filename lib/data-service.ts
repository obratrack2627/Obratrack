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
  MaterialProyecto,
  BitacoraEntrada,
  EventoAgenda,
  MensajeChatCotizador,
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
import { firestoreService } from './firebase/firestore';

// Claves de almacenamiento local para persistencia limpia por usuario
const KEYS = {
  PROYECTOS: 'obratrack_proyectos_v6',
  ACTIVIDADES: 'obratrack_actividades_v6',
  PAGOS: 'obratrack_pagos_v6',
  IMPREVISTOS: 'obratrack_imprevistos_v6',
  REPORTES: 'obratrack_reportes_v6',
  USUARIOS: 'obratrack_usuarios_v6',
  CLIENTES: 'obratrack_clientes_v6',
  ACTIVE_USER: 'obratrack_active_user_v6',
  COTIZACIONES: 'obratrack_cotizaciones_v6',
  PLAN: 'obratrack_active_plan_v6',
  MATERIALES_PROYECTO: 'obratrack_materiales_proyecto_v6',
  BITACORA: 'obratrack_bitacora_v6',
  AGENDA: 'obratrack_agenda_eventos_v6',
  CHAT_SESSION: 'obratrack_chat_session_history_v6',
};

const INITIAL_AGENDA: EventoAgenda[] = [];

class DataService {
  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  public getItem<T>(key: string, defaultValue: T): T {
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
    let usuarios = this.getItem<Usuario[]>(KEYS.USUARIOS, INITIAL_USUARIOS);
    const active = this.getActiveUser();
    if (active) {
      const existsIndex = usuarios.findIndex(
        (u) => u.id === active.id || (u.email && active.email && u.email.toLowerCase() === active.email.toLowerCase())
      );
      if (existsIndex === -1) {
        usuarios = [active, ...usuarios];
        this.setItem(KEYS.USUARIOS, usuarios);
      } else {
        // Sincronizar datos actualizados del dueño
        usuarios[existsIndex] = { ...usuarios[existsIndex], ...active, rol: active.rol || 'admin' };
      }
    }
    return usuarios;
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
    firestoreService.saveUsuario(newUsuario).catch((err) => console.warn('Sync usuario:', err));
    return newUsuario;
  }

  updateUsuario(id: string, data: Partial<Usuario>): Usuario | null {
    const usuarios = this.getUsuarios();
    const index = usuarios.findIndex((u) => u.id === id);
    if (index === -1) return null;
    usuarios[index] = { ...usuarios[index], ...data };
    this.setItem(KEYS.USUARIOS, usuarios);
    firestoreService.saveUsuario(usuarios[index]).catch((err) => console.warn('Sync usuario:', err));

    // Si se editó el usuario activo, actualizar activeUser también
    const active = this.getActiveUser();
    if (active && (active.id === id || active.email === usuarios[index].email)) {
      this.setActiveUser(usuarios[index]);
    }

    return usuarios[index];
  }

  deleteUsuario(id: string): boolean {
    const usuarios = this.getUsuarios();
    const target = usuarios.find((u) => u.id === id);
    // El dueño / administrador no se puede eliminar, solo editar
    if (target?.rol === 'admin') {
      console.warn('El dueño / administrador de la constructora no se puede eliminar, solo editar.');
      return false;
    }
    const filtered = usuarios.filter((u) => u.id !== id);
    this.setItem(KEYS.USUARIOS, filtered);
    firestoreService.deleteUsuario(id).catch((err) => console.warn('Delete usuario:', err));
    return true;
  }

  getActiveUser(): Usuario | null {
    return this.getItem<Usuario | null>(KEYS.ACTIVE_USER, null);
  }

  setActiveUser(user: Usuario | null): void {
    if (user) {
      this.setItem(KEYS.ACTIVE_USER, user);
      // Asegurar que el usuario activo esté en la lista de usuarios
      this.getUsuarios();
    } else {
      this.clearActiveUser();
    }
  }

  clearActiveUser(): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.removeItem(KEYS.ACTIVE_USER);
      this.clearChatSessionHistory();
    } catch (e) {
      console.error(e);
    }
  }

  // --- PERSISTENCIA DE CHAT POR SESIÓN ---
  getChatSessionHistory(): MensajeChatCotizador[] | null {
    if (!this.isBrowser()) return null;
    try {
      const data = sessionStorage.getItem(KEYS.CHAT_SESSION) || localStorage.getItem(KEYS.CHAT_SESSION);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  saveChatSessionHistory(messages: any[]): void {
    if (!this.isBrowser()) return;
    try {
      const serialized = JSON.stringify(messages);
      sessionStorage.setItem(KEYS.CHAT_SESSION, serialized);
      localStorage.setItem(KEYS.CHAT_SESSION, serialized);
    } catch (e) {
      console.error(e);
    }
  }

  clearChatSessionHistory(): void {
    if (!this.isBrowser()) return;
    try {
      sessionStorage.removeItem(KEYS.CHAT_SESSION);
      localStorage.removeItem(KEYS.CHAT_SESSION);
    } catch (e) {
      console.error(e);
    }
  }

  setActiveUserRole(rol: UserRole): Usuario {
    const usuarios = this.getUsuarios();
    const current = this.getActiveUser();
    const user = { ...(current || usuarios[0]), rol };
    this.setActiveUser(user);
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

  getClienteById(id: string): Cliente | null {
    const clientes = this.getClientes();
    return clientes.find((c) => c.id === id) || null;
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
    firestoreService.saveCliente(newCliente).catch((err) => console.warn('Sync cliente:', err));
    return newCliente;
  }

  updateCliente(id: string, data: Partial<Cliente>): Cliente | null {
    const clientes = this.getClientes();
    const index = clientes.findIndex((c) => c.id === id);
    if (index === -1) return null;
    clientes[index] = { ...clientes[index], ...data };
    this.setItem(KEYS.CLIENTES, clientes);
    firestoreService.saveCliente(clientes[index]).catch((err) => console.warn('Sync cliente:', err));
    return clientes[index];
  }

  deleteCliente(id: string): boolean {
    const clientes = this.getClientes();
    const filtered = clientes.filter((c) => c.id !== id);
    this.setItem(KEYS.CLIENTES, filtered);
    firestoreService.deleteCliente(id).catch((err) => console.warn('Delete cliente:', err));
    return true;
  }

  buscarClientePorRutONombre(busqueda: string): Cliente | null {
    if (!busqueda || busqueda.trim() === '') return null;
    const clientes = this.getClientes();

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const cleanQuery = normalize(busqueda);
    const cleanSearchDigits = cleanQuery.replace(/[^a-z0-9]/g, '');

    // 1. Buscar por RUT
    for (const c of clientes) {
      if (c.rut) {
        const cleanRut = normalize(c.rut).replace(/[^a-z0-9]/g, '');
        if (cleanRut.length >= 7 && cleanSearchDigits.includes(cleanRut)) {
          return c;
        }
      }
    }

    // 2. Buscar por Nombre Completo
    for (const c of clientes) {
      const cleanNombre = normalize(c.nombre);
      if (cleanQuery.includes(cleanNombre)) {
        return c;
      }
    }

    // 3. Buscar por Nombre de Pila o Apellido (tokens >= 4 caracteres)
    for (const c of clientes) {
      const tokens = normalize(c.nombre).split(/\s+/);
      for (const token of tokens) {
        if (token.length >= 4 && cleanQuery.includes(token)) {
          return c;
        }
      }
    }

    return null;
  }

  obtenerFichaCompletaCliente(clienteId: string): {
    cliente: Cliente;
    proyectos: Array<{
      proyecto: Proyecto;
      actividades: Actividad[];
      porcentaje_avance: number;
      total_contratado: number;
      total_pagado: number;
      saldo_pendiente: number;
      fotos_avance: string[];
    }>;
  } | null {
    const cliente = this.getClienteById(clienteId);
    if (!cliente) return null;

    const proyectos = this.getProyectos().filter((p) => p.cliente_id === clienteId);
    const todasActividades = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const todosPagos = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    const todasBitacoras = this.getItem<BitacoraEntrada[]>(KEYS.BITACORA, []);

    const fotosPorDefecto = [
      'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80',
    ];

    const proyectosDetalle = proyectos.map((p) => {
      const acts = todasActividades.filter((a) => a.proyecto_id === p.id);
      const pagos = todosPagos.filter((pg) => pg.proyecto_id === p.id);
      const bitacoras = todasBitacoras.filter((b) => b.proyecto_id === p.id && b.foto_url);

      const totalPagado = pagos.reduce((sum, pg) => sum + pg.monto, 0);
      const totalContratado = p.monto_cotizado || 3500000;
      const saldoPendiente = Math.max(0, totalContratado - totalPagado);

      const porcentajeAvance =
        acts.length > 0
          ? Math.round(acts.reduce((sum, a) => sum + (a.porcentaje_avance || 0), 0) / acts.length)
          : 50;

      const fotos = bitacoras.map((b) => b.foto_url!).concat(fotosPorDefecto);

      return {
        proyecto: p,
        actividades: acts,
        porcentaje_avance: porcentajeAvance,
        total_contratado: totalContratado,
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
        fotos_avance: Array.from(new Set(fotos)),
      };
    });

    return {
      cliente,
      proyectos: proyectosDetalle,
    };
  }

  // --- PROYECTOS ---
  getProyectos(): Proyecto[] {
    const proyectos = this.getItem<Proyecto[]>(KEYS.PROYECTOS, INITIAL_PROYECTOS);
    const clientes = this.getClientes();
    const usuarios = this.getUsuarios();
    const actividades = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const pagos = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    const imprevistos = this.getItem<Imprevisto[]>(KEYS.IMPREVISTOS, INITIAL_IMPREVISTOS);
    const materiales = this.getItem<MaterialProyecto[]>(KEYS.MATERIALES_PROYECTO, []);
    const bitacora = this.getItem<BitacoraEntrada[]>(KEYS.BITACORA, []);

    return proyectos.map((p) => {
      const projActs = actividades.filter((a) => a.proyecto_id === p.id);
      const projPagos = pagos.filter((pay) => pay.proyecto_id === p.id);
      const projImprevistos = imprevistos.filter((imp) => imp.proyecto_id === p.id);
      const projMateriales = materiales.filter((m) => m.proyecto_id === p.id);
      const projBitacora = bitacora.filter((b) => b.proyecto_id === p.id);
      const projTrabajadores = usuarios.filter((u) => (p.trabajadores_ids || []).includes(u.id));

      const total_pagado = projPagos.reduce((sum, item) => sum + Number(item.monto), 0);
      const total_imprevistos = projImprevistos.reduce((sum, item) => sum + Number(item.monto), 0);
      const total_materiales = projMateriales.reduce((sum, item) => sum + Number(item.subtotal || (item.cantidad * item.precio_unitario)), 0);
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
        trabajadores: projTrabajadores,
        actividades: projActs,
        materiales: projMateriales,
        bitacora: projBitacora,
        pagos: projPagos,
        imprevistos: projImprevistos,
        total_pagado,
        total_imprevistos,
        total_materiales,
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

        const newActObj: Actividad = {
          id: `act-${newProjId}-${idx + 1}`,
          proyecto_id: newProjId,
          nombre: act.nombre,
          fecha_inicio: currentStartDate.toISOString().split('T')[0],
          fecha_termino: endDate.toISOString().split('T')[0],
          porcentaje_avance: 0,
          estado: 'pendiente',
          orden: idx + 1,
        };

        allActs.push(newActObj);
        firestoreService.saveActividad(newActObj).catch((err) => console.warn('Sync act:', err));

        currentStartDate = new Date(endDate);
        currentStartDate.setDate(currentStartDate.getDate() + 1);
      });

      this.setItem(KEYS.ACTIVIDADES, allActs);
    }

    firestoreService.saveProyecto(newProyecto).catch((err) => console.warn('Sync proyecto:', err));
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

    firestoreService.deleteProyecto(id).catch((err) => console.warn('Delete proyecto:', err));
    return true;
  }

  updateProyecto(id: string, data: Partial<Proyecto>): Proyecto | null {
    const proyectos = this.getItem<Proyecto[]>(KEYS.PROYECTOS, INITIAL_PROYECTOS);
    const index = proyectos.findIndex((p) => p.id === id);
    if (index === -1) return null;

    proyectos[index] = {
      ...proyectos[index],
      ...data,
    };
    this.setItem(KEYS.PROYECTOS, proyectos);
    firestoreService.saveProyecto(proyectos[index]).catch((err) => console.warn('Sync proyecto:', err));
    return proyectos[index];
  }

  // --- MATERIALES DE PROYECTO ---
  getMaterialesProyecto(proyectoId?: string): MaterialProyecto[] {
    const all = this.getItem<MaterialProyecto[]>(KEYS.MATERIALES_PROYECTO, []);
    return proyectoId ? all.filter((m) => m.proyecto_id === proyectoId) : all;
  }

  createMaterialProyecto(material: Omit<MaterialProyecto, 'id'>): MaterialProyecto {
    const all = this.getItem<MaterialProyecto[]>(KEYS.MATERIALES_PROYECTO, []);
    const newMat: MaterialProyecto = {
      ...material,
      id: 'mat-' + Date.now(),
      subtotal: material.subtotal || (material.cantidad * material.precio_unitario),
      created_at: new Date().toISOString(),
    };
    all.push(newMat);
    this.setItem(KEYS.MATERIALES_PROYECTO, all);
    firestoreService.saveMaterial(newMat).catch((err) => console.warn('Sync mat:', err));
    return newMat;
  }

  deleteMaterialProyecto(id: string): boolean {
    const all = this.getItem<MaterialProyecto[]>(KEYS.MATERIALES_PROYECTO, []);
    this.setItem(KEYS.MATERIALES_PROYECTO, all.filter((m) => m.id !== id));
    firestoreService.deleteMaterial(id).catch((err) => console.warn('Delete mat:', err));
    return true;
  }

  updateMaterialProyecto(id: string, data: Partial<MaterialProyecto>): MaterialProyecto | null {
    const all = this.getItem<MaterialProyecto[]>(KEYS.MATERIALES_PROYECTO, []);
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    all[idx] = {
      ...all[idx],
      ...data,
      subtotal: (data.cantidad ?? all[idx].cantidad) * (data.precio_unitario ?? all[idx].precio_unitario),
    };
    this.setItem(KEYS.MATERIALES_PROYECTO, all);
    firestoreService.saveMaterial(all[idx]).catch((err) => console.warn('Sync mat:', err));
    return all[idx];
  }

  // --- BITÁCORA Y FOTOS DE OBRA ---
  getBitacora(proyectoId?: string): BitacoraEntrada[] {
    const all = this.getItem<BitacoraEntrada[]>(KEYS.BITACORA, []);
    const list = proyectoId ? all.filter((b) => b.proyecto_id === proyectoId) : all;
    return list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  createBitacoraEntrada(entry: Omit<BitacoraEntrada, 'id'>): BitacoraEntrada {
    const all = this.getItem<BitacoraEntrada[]>(KEYS.BITACORA, []);
    const newEntry: BitacoraEntrada = {
      ...entry,
      id: 'bit-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    all.unshift(newEntry);
    this.setItem(KEYS.BITACORA, all);
    firestoreService.saveBitacoraEntrada(newEntry).catch((err) => console.warn('Sync bitacora:', err));
    return newEntry;
  }

  updateBitacoraEntrada(id: string, data: Partial<BitacoraEntrada>): BitacoraEntrada | null {
    const all = this.getItem<BitacoraEntrada[]>(KEYS.BITACORA, []);
    const index = all.findIndex((b) => b.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...data };
    this.setItem(KEYS.BITACORA, all);
    firestoreService.saveBitacoraEntrada(all[index]).catch((err) => console.warn('Sync bitacora:', err));
    return all[index];
  }

  deleteBitacoraEntrada(id: string): boolean {
    const all = this.getItem<BitacoraEntrada[]>(KEYS.BITACORA, []);
    this.setItem(KEYS.BITACORA, all.filter((b) => b.id !== id));
    firestoreService.deleteBitacoraEntrada(id).catch((err) => console.warn('Delete bitacora:', err));
    return true;
  }

  // --- ACTIVIDADES (CARTA GANTT) ---
  getActividades(proyectoId?: string): Actividad[] {
    const all = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const usuarios = this.getUsuarios();
    const list = proyectoId ? all.filter((a) => a.proyecto_id === proyectoId) : all;
    return list
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
    firestoreService.saveActividad(newAct).catch((err) => console.warn('Sync act:', err));
    return newAct;
  }

  updateActividad(id: string, updates: Partial<Actividad>): Actividad | null {
    const all = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const index = all.findIndex((a) => a.id === id);
    if (index === -1) return null;

    const updated = { ...all[index], ...updates, updated_at: new Date().toISOString() };
    all[index] = updated;
    this.setItem(KEYS.ACTIVIDADES, all);
    firestoreService.saveActividad(updated).catch((err) => console.warn('Sync act:', err));
    return updated;
  }

  deleteActividad(id: string): boolean {
    const all = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    this.setItem(KEYS.ACTIVIDADES, all.filter((a) => a.id !== id));
    firestoreService.deleteActividad(id).catch((err) => console.warn('Delete act:', err));
    return true;
  }

  // --- PAGOS & FINANZAS ---
  getPagos(proyectoId?: string): Pago[] {
    const all = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    return proyectoId ? all.filter((p) => p.proyecto_id === proyectoId) : all;
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
    firestoreService.savePago(newPago).catch((err) => console.warn('Sync pago:', err));
    return newPago;
  }

  updatePago(id: string, data: Partial<Pago>): Pago | null {
    const all = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    const index = all.findIndex((p) => p.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...data };
    this.setItem(KEYS.PAGOS, all);
    firestoreService.savePago(all[index]).catch((err) => console.warn('Sync pago:', err));
    return all[index];
  }

  deletePago(id: string): boolean {
    const all = this.getItem<Pago[]>(KEYS.PAGOS, INITIAL_PAGOS);
    this.setItem(KEYS.PAGOS, all.filter((p) => p.id !== id));
    firestoreService.deletePago(id).catch((err) => console.warn('Delete pago:', err));
    return true;
  }

  // --- IMPREVISTOS ---
  getImprevistos(proyectoId?: string): Imprevisto[] {
    const all = this.getItem<Imprevisto[]>(KEYS.IMPREVISTOS, INITIAL_IMPREVISTOS);
    const acts = this.getItem<Actividad[]>(KEYS.ACTIVIDADES, INITIAL_ACTIVIDADES);
    const list = proyectoId ? all.filter((i) => i.proyecto_id === proyectoId) : all;
    return list.map((i) => ({
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

  updateImprevisto(id: string, data: Partial<Imprevisto>): Imprevisto | null {
    const all = this.getItem<Imprevisto[]>(KEYS.IMPREVISTOS, INITIAL_IMPREVISTOS);
    const index = all.findIndex((i) => i.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...data };
    this.setItem(KEYS.IMPREVISTOS, all);
    return all[index];
  }

  deleteImprevisto(id: string): boolean {
    const all = this.getItem<Imprevisto[]>(KEYS.IMPREVISTOS, INITIAL_IMPREVISTOS);
    this.setItem(KEYS.IMPREVISTOS, all.filter((i) => i.id !== id));
    return true;
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
        empresa_id: '11111111-1111-1111-1111-111111111111',
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

  // --- AGENDA DE VISITAS, HITOS Y EVENTOS (CREADOS POR ASISTENTE IA O MANUAL) ---
  getEventosAgenda(): EventoAgenda[] {
    return this.getItem<EventoAgenda[]>(KEYS.AGENDA, INITIAL_AGENDA);
  }

  saveEventoAgenda(
    evento: Omit<EventoAgenda, 'id' | 'created_at'> & { id?: string }
  ): EventoAgenda {
    const list = this.getEventosAgenda();
    if (evento.id) {
      const idx = list.findIndex((e) => e.id === evento.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          ...evento,
        } as EventoAgenda;
        this.setItem(KEYS.AGENDA, list);
        return list[idx];
      }
    }

    const nuevo: EventoAgenda = {
      ...evento,
      id: 'evt-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    list.unshift(nuevo);
    this.setItem(KEYS.AGENDA, list);
    return nuevo;
  }

  deleteEventoAgenda(id: string): boolean {
    let list = this.getEventosAgenda();
    list = list.filter((e) => e.id !== id);
    this.setItem(KEYS.AGENDA, list);
    return true;
  }

  toggleEventoAgenda(id: string): boolean {
    const list = this.getEventosAgenda();
    const item = list.find((e) => e.id === id);
    if (!item) return false;
    item.completado = !item.completado;
    this.setItem(KEYS.AGENDA, list);
    return true;
  }

  // --- MÉTODOS DE CONTROL Y EJECUCIÓN AUTÓNOMA DESDE EL ASISTENTE IA ---

  crearProyectoDesdeIA(datos: {
    nombre: string;
    cliente_nombre?: string;
    cliente_telefono?: string;
    comuna?: string;
    direccion?: string;
    monto?: number;
    dias?: number;
    descripcion?: string;
    partidas?: string[];
  }): Proyecto {
    const clientes = this.getClientes();
    let clienteId = clientes[0]?.id || 'c1';

    if (datos.cliente_nombre && datos.cliente_nombre.trim() !== '') {
      const match = clientes.find((c) =>
        c.nombre.toLowerCase().includes(datos.cliente_nombre!.toLowerCase())
      );
      if (match) {
        clienteId = match.id;
      } else {
        const nuevoCliente = this.createCliente({
          empresa_id: '11111111-1111-1111-1111-111111111111',
          nombre: datos.cliente_nombre,
          telefono: datos.cliente_telefono || '+56 9 1234 5678',
          direccion: datos.comuna || 'Santiago, Chile',
        });
        clienteId = nuevoCliente.id;
      }
    }

    const fechaInicio = new Date().toISOString().split('T')[0];
    const duracion = Number(datos.dias) || 20;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + duracion);

    const actividades =
      datos.partidas && datos.partidas.length > 0
        ? datos.partidas.map((p, idx) => ({ nombre: p, dias: Math.max(2, Math.round(duracion / datos.partidas!.length)) }))
        : [
            { nombre: 'Instalación de faenas y trazado', dias: 3 },
            { nombre: 'Obra gruesa y fundaciones', dias: 8 },
            { nombre: 'Instalaciones y terminaciones', dias: 6 },
            { nombre: 'Recepción conforme y entrega', dias: 3 },
          ];

    return this.createProyecto(
      {
        empresa_id: '11111111-1111-1111-1111-111111111111',
        cliente_id: clienteId,
        nombre: datos.nombre,
        descripcion: datos.descripcion || `Obra gestionada automáticamente por el Copiloto IA de ObraTrack.`,
        comuna: datos.comuna || 'Santiago, Chile',
        direccion: datos.direccion || datos.comuna || 'Dirección de obra',
        fecha_inicio: fechaInicio,
        fecha_termino_estimada: endDate.toISOString().split('T')[0],
        estado: 'activo',
        monto_cotizado: Number(datos.monto) || 3500000,
      },
      actividades
    );
  }

  agregarTrabajadorDesdeIA(datos: {
    nombre: string;
    rol?: string;
    telefono?: string;
    email?: string;
  }): Usuario {
    let rolNormalizado: UserRole = 'terreno';
    const r = (datos.rol || '').toLowerCase();
    if (r.includes('admin') || r.includes('jefe')) rolNormalizado = 'admin';
    else if (r.includes('super') || r.includes('capataz')) rolNormalizado = 'supervisor';

    const cleanEmail =
      datos.email ||
      `${datos.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '')}@obratrack.cl`;

    return this.createUsuario({
      empresa_id: '11111111-1111-1111-1111-111111111111',
      nombre: datos.nombre,
      rol: rolNormalizado,
      telefono_whatsapp: datos.telefono || '+56 9 8765 4321',
      email: cleanEmail,
    });
  }

  asignarTrabajadorAProyecto(trabajadorNombre: string, proyectoNombre: string): boolean {
    const proyectos = this.getProyectos();
    const usuarios = this.getUsuarios();

    const proj = proyectos.find((p) =>
      p.nombre.toLowerCase().includes(proyectoNombre.toLowerCase())
    );
    const user = usuarios.find((u) =>
      u.nombre.toLowerCase().includes(trabajadorNombre.toLowerCase())
    );

    if (!proj || !user) return false;

    const list = this.getItem<Proyecto[]>(KEYS.PROYECTOS, INITIAL_PROYECTOS);
    const target = list.find((p) => p.id === proj.id);
    if (!target) return false;

    if (!target.trabajadores_ids) target.trabajadores_ids = [];
    if (!target.trabajadores_ids.includes(user.id)) {
      target.trabajadores_ids.push(user.id);
      this.setItem(KEYS.PROYECTOS, list);
    }
    return true;
  }

  // --- SINCRONIZACIÓN CON FIREBASE CLOUD FIRESTORE ---
  async syncWithFirestore(): Promise<{ success: boolean; message: string; count?: number }> {
    try {
      const { firestoreService } = await import('@/lib/firebase/firestore');
      const proyectos = this.getProyectos();
      const actividades = this.getActividades();
      const pagos = this.getPagos();
      const imprevistos = this.getImprevistos();
      const materiales = this.getMaterialesProyecto();
      const bitacora = this.getBitacora();
      const clientes = this.getClientes();
      const usuarios = this.getUsuarios();
      const agenda = this.getEventosAgenda();

      const result = await firestoreService.bulkSyncToFirestore({
        proyectos,
        actividades,
        pagos,
        imprevistos,
        materiales,
        bitacora,
        clientes,
        usuarios,
        agenda,
      });

      if (result.success) {
        return {
          success: true,
          count: result.count,
          message: `Sincronización exitosa con Firebase Cloud Firestore (${result.count} documentos).`,
        };
      } else {
        return {
          success: false,
          message: result.error || 'Error al sincronizar con Firebase Cloud Firestore.',
        };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Error de sincronización con Firebase.' };
    }
  }

  async pullFromFirestore(): Promise<{ success: boolean; message: string }> {
    try {
      const { firestoreService } = await import('@/lib/firebase/firestore');
      const [projs, acts, pgs, imps, mats, bit, clis, usrs, agn] = await Promise.all([
        firestoreService.getProyectos(),
        firestoreService.getActividades(),
        firestoreService.getPagos(),
        firestoreService.getImprevistos(),
        firestoreService.getMateriales(),
        firestoreService.getBitacora(),
        firestoreService.getClientes(),
        firestoreService.getUsuarios(),
        firestoreService.getAgenda(),
      ]);

      if (projs.length > 0) this.setItem(KEYS.PROYECTOS, projs);
      if (acts.length > 0) this.setItem(KEYS.ACTIVIDADES, acts);
      if (pgs.length > 0) this.setItem(KEYS.PAGOS, pgs);
      if (imps.length > 0) this.setItem(KEYS.IMPREVISTOS, imps);
      if (mats.length > 0) this.setItem(KEYS.MATERIALES_PROYECTO, mats);
      if (bit.length > 0) this.setItem(KEYS.BITACORA, bit);
      if (clis.length > 0) this.setItem(KEYS.CLIENTES, clis);
      if (usrs.length > 0) this.setItem(KEYS.USUARIOS, usrs);
      if (agn.length > 0) this.setItem(KEYS.AGENDA, agn);

      return { success: true, message: 'Datos descargados exitosamente desde Firebase Cloud Firestore.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error al obtener datos desde Firebase.' };
    }
  }
}

export const dataService = new DataService();


