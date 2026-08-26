import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './config';
import {
  Proyecto,
  Actividad,
  Pago,
  Imprevisto,
  MaterialProyecto,
  BitacoraEntrada,
  Cliente,
  Usuario,
  CotizacionEstimacion,
  EventoAgenda,
  ReporteWhatsApp,
} from '@/types/database';

export class FirestoreService {
  private get db() {
    return getFirebaseFirestore();
  }

  // --- PROYECTOS ---
  async getProyectos(): Promise<Proyecto[]> {
    try {
      const snap = await getDocs(collection(this.db, 'proyectos'));
      return snap.docs.map((d) => d.data() as Proyecto);
    } catch (err) {
      console.warn('Error al cargar proyectos desde Firestore:', err);
      return [];
    }
  }

  async saveProyecto(proyecto: Proyecto): Promise<void> {
    await setDoc(doc(this.db, 'proyectos', proyecto.id), proyecto, { merge: true });
  }

  async deleteProyecto(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'proyectos', id));
  }

  // --- ACTIVIDADES (GANTT) ---
  async getActividades(proyectoId?: string): Promise<Actividad[]> {
    try {
      let q = collection(this.db, 'actividades');
      if (proyectoId) {
        const snap = await getDocs(query(q, where('proyecto_id', '==', proyectoId)));
        return snap.docs.map((d) => d.data() as Actividad);
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as Actividad);
    } catch (err) {
      console.warn('Error al cargar actividades desde Firestore:', err);
      return [];
    }
  }

  async saveActividad(actividad: Actividad): Promise<void> {
    await setDoc(doc(this.db, 'actividades', actividad.id), actividad, { merge: true });
  }

  async deleteActividad(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'actividades', id));
  }

  // --- PAGOS ---
  async getPagos(proyectoId?: string): Promise<Pago[]> {
    try {
      let q = collection(this.db, 'pagos');
      if (proyectoId) {
        const snap = await getDocs(query(q, where('proyecto_id', '==', proyectoId)));
        return snap.docs.map((d) => d.data() as Pago);
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as Pago);
    } catch (err) {
      console.warn('Error al cargar pagos desde Firestore:', err);
      return [];
    }
  }

  async savePago(pago: Pago): Promise<void> {
    await setDoc(doc(this.db, 'pagos', pago.id), pago, { merge: true });
  }

  async deletePago(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'pagos', id));
  }

  // --- IMPREVISTOS ---
  async getImprevistos(proyectoId?: string): Promise<Imprevisto[]> {
    try {
      let q = collection(this.db, 'imprevistos');
      if (proyectoId) {
        const snap = await getDocs(query(q, where('proyecto_id', '==', proyectoId)));
        return snap.docs.map((d) => d.data() as Imprevisto);
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as Imprevisto);
    } catch (err) {
      console.warn('Error al cargar imprevistos desde Firestore:', err);
      return [];
    }
  }

  async saveImprevisto(imprevisto: Imprevisto): Promise<void> {
    await setDoc(doc(this.db, 'imprevistos', imprevisto.id), imprevisto, { merge: true });
  }

  async deleteImprevisto(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'imprevistos', id));
  }

  // --- MATERIALES ---
  async getMateriales(proyectoId?: string): Promise<MaterialProyecto[]> {
    try {
      let q = collection(this.db, 'materiales');
      if (proyectoId) {
        const snap = await getDocs(query(q, where('proyecto_id', '==', proyectoId)));
        return snap.docs.map((d) => d.data() as MaterialProyecto);
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as MaterialProyecto);
    } catch (err) {
      console.warn('Error al cargar materiales desde Firestore:', err);
      return [];
    }
  }

  async saveMaterial(material: MaterialProyecto): Promise<void> {
    await setDoc(doc(this.db, 'materiales', material.id), material, { merge: true });
  }

  async deleteMaterial(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'materiales', id));
  }

  // --- BITÁCORA ---
  async getBitacora(proyectoId?: string): Promise<BitacoraEntrada[]> {
    try {
      let q = collection(this.db, 'bitacora');
      if (proyectoId) {
        const snap = await getDocs(query(q, where('proyecto_id', '==', proyectoId)));
        return snap.docs.map((d) => d.data() as BitacoraEntrada);
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as BitacoraEntrada);
    } catch (err) {
      console.warn('Error al cargar bitácora desde Firestore:', err);
      return [];
    }
  }

  async saveBitacoraEntrada(entrada: BitacoraEntrada): Promise<void> {
    await setDoc(doc(this.db, 'bitacora', entrada.id), entrada, { merge: true });
  }

  async deleteBitacoraEntrada(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'bitacora', id));
  }

  // --- CLIENTES ---
  async getClientes(): Promise<Cliente[]> {
    try {
      const snap = await getDocs(collection(this.db, 'clientes'));
      return snap.docs.map((d) => d.data() as Cliente);
    } catch (err) {
      console.warn('Error al cargar clientes desde Firestore:', err);
      return [];
    }
  }

  async saveCliente(cliente: Cliente): Promise<void> {
    await setDoc(doc(this.db, 'clientes', cliente.id), cliente, { merge: true });
  }

  async deleteCliente(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'clientes', id));
  }

  // --- USUARIOS / EQUIPO ---
  async getUsuarios(): Promise<Usuario[]> {
    try {
      const snap = await getDocs(collection(this.db, 'usuarios'));
      return snap.docs.map((d) => d.data() as Usuario);
    } catch (err) {
      console.warn('Error al cargar usuarios desde Firestore:', err);
      return [];
    }
  }

  async saveUsuario(usuario: Usuario): Promise<void> {
    await setDoc(doc(this.db, 'usuarios', usuario.id), usuario, { merge: true });
  }

  async deleteUsuario(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'usuarios', id));
  }

  // --- AGENDA ---
  async getAgenda(): Promise<EventoAgenda[]> {
    try {
      const snap = await getDocs(collection(this.db, 'agenda'));
      return snap.docs.map((d) => d.data() as EventoAgenda);
    } catch (err) {
      console.warn('Error al cargar agenda desde Firestore:', err);
      return [];
    }
  }

  async saveEventoAgenda(evento: EventoAgenda): Promise<void> {
    await setDoc(doc(this.db, 'agenda', evento.id), evento, { merge: true });
  }

  async deleteEventoAgenda(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'agenda', id));
  }

  // --- COTIZACIONES IA ---
  async getCotizaciones(): Promise<CotizacionEstimacion[]> {
    try {
      const snap = await getDocs(collection(this.db, 'cotizaciones'));
      return snap.docs.map((d) => d.data() as CotizacionEstimacion);
    } catch (err) {
      console.warn('Error al cargar cotizaciones desde Firestore:', err);
      return [];
    }
  }

  async saveCotizacion(cotizacion: CotizacionEstimacion): Promise<void> {
    await setDoc(doc(this.db, 'cotizaciones', cotizacion.id), cotizacion, { merge: true });
  }

  // --- REPORTES WHATSAPP ---
  async getReportes(proyectoId?: string): Promise<ReporteWhatsApp[]> {
    try {
      let q = collection(this.db, 'reportes');
      if (proyectoId) {
        const snap = await getDocs(query(q, where('proyecto_id', '==', proyectoId)));
        return snap.docs.map((d) => d.data() as ReporteWhatsApp);
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as ReporteWhatsApp);
    } catch (err) {
      console.warn('Error al cargar reportes desde Firestore:', err);
      return [];
    }
  }

  async saveReporte(reporte: ReporteWhatsApp): Promise<void> {
    await setDoc(doc(this.db, 'reportes', reporte.id), reporte, { merge: true });
  }

  // Sincronización masiva de datos iniciales / locales a Firestore
  async bulkSyncToFirestore(data: {
    proyectos: Proyecto[];
    actividades: Actividad[];
    pagos: Pago[];
    imprevistos: Imprevisto[];
    materiales: MaterialProyecto[];
    bitacora: BitacoraEntrada[];
    clientes: Cliente[];
    usuarios: Usuario[];
    agenda: EventoAgenda[];
  }): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const batch = writeBatch(this.db);
      let count = 0;

      data.proyectos.forEach((p) => {
        batch.set(doc(this.db, 'proyectos', p.id), p, { merge: true });
        count++;
      });
      data.actividades.forEach((a) => {
        batch.set(doc(this.db, 'actividades', a.id), a, { merge: true });
        count++;
      });
      data.pagos.forEach((p) => {
        batch.set(doc(this.db, 'pagos', p.id), p, { merge: true });
        count++;
      });
      data.imprevistos.forEach((i) => {
        batch.set(doc(this.db, 'imprevistos', i.id), i, { merge: true });
        count++;
      });
      data.materiales.forEach((m) => {
        batch.set(doc(this.db, 'materiales', m.id), m, { merge: true });
        count++;
      });
      data.bitacora.forEach((b) => {
        batch.set(doc(this.db, 'bitacora', b.id), b, { merge: true });
        count++;
      });
      data.clientes.forEach((c) => {
        batch.set(doc(this.db, 'clientes', c.id), c, { merge: true });
        count++;
      });
      data.usuarios.forEach((u) => {
        batch.set(doc(this.db, 'usuarios', u.id), u, { merge: true });
        count++;
      });
      data.agenda.forEach((ev) => {
        batch.set(doc(this.db, 'agenda', ev.id), ev, { merge: true });
        count++;
      });

      await batch.commit();
      return { success: true, count };
    } catch (err: any) {
      console.error('Error en bulkSyncToFirestore:', err);
      return { success: false, count: 0, error: err.message };
    }
  }
}

export const firestoreService = new FirestoreService();
